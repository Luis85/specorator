import { applyFileToolPath, seedFileToolPathFromLocations } from '../../core/tools/toolInput';
import type { StreamChunk } from '../../core/types';
import type { SDKToolUseResult } from '../../core/types/diff';
import type {
  AcpToolCall,
  AcpToolCallContent,
  AcpToolCallLocation,
  AcpToolCallUpdate,
} from './types';

// `rawInput` is the accumulated wire-shape input; `input` is its normalized
// projection. Both are kept because provider normalizers are not idempotent
// (e.g. Cursor maps `path` → `file_path`), so re-normalizing an already
// normalized object would drop fields — every rebuild starts from raw.
// `content`/`rawOutput` retain the last result payload seen on any update, so a
// terminal status update without its own payload still yields a toolUseResult.
interface AcpToolStreamState {
  content?: AcpToolCallContent[];
  input: Record<string, unknown>;
  // Last-seen ACP `locations` for this call. ACP delivers a file tool's touched
  // path here (or in the title) far more often than in `rawInput`, and a later
  // update may carry rawInput without re-sending locations, so it is remembered.
  locations?: AcpToolCallLocation[];
  rawInput: Record<string, unknown>;
  rawName: string;
  rawOutput?: unknown;
}

export interface AcpToolStreamPresentationAdapter {
  // `title` is the tool call's human title; a provider may parse it for data
  // that never arrives in `input` (e.g. Cursor's delete-as-edit carries the
  // path only in the title). Optional, so pass-through adapters can ignore it.
  normalizeToolInput(
    rawName: string | undefined,
    input: Record<string, unknown>,
    title?: string | null,
  ): Record<string, unknown>;
  normalizeToolName(rawName: string | undefined): string;
  normalizeToolUseResult(
    rawName: string | undefined,
    input: Record<string, unknown>,
    rawOutput: unknown,
    content?: AcpToolCallContent[] | null,
  ): SDKToolUseResult | undefined;
  resolveRawToolName(
    currentRawName: string | undefined,
    update: {
      kind?: string | null;
      title?: string | null;
    },
  ): string;
}

export class AcpToolStreamAdapter {
  private readonly toolStates = new Map<string, AcpToolStreamState>();
  // Last tool name actually emitted in a `tool_use` chunk per tool id. A later
  // update can carry the semantic `kind` (edit/delete) that corrects a call
  // first rendered under a prose title; comparing against this lets the adapter
  // re-emit the corrected name even when the update carries no rawInput.
  private readonly emittedNames = new Map<string, string>();
  // Last input actually emitted per tool id. A later update can seed a path from
  // `locations` (unchanged name, no rawInput); comparing against this re-emits
  // the tool_use so the newly surfaced file reaches the consumer.
  private readonly emittedInputs = new Map<string, Record<string, unknown>>();

  constructor(private readonly adapter: AcpToolStreamPresentationAdapter) {}

  reset(): void {
    this.toolStates.clear();
    this.emittedNames.clear();
    this.emittedInputs.clear();
  }

  normalizeToolCall(toolCall: AcpToolCall, chunks: StreamChunk[]): StreamChunk[] {
    const state = this.updateToolState(undefined, {
      kind: toolCall.kind,
      locations: toolCall.locations,
      rawInput: toolCall.rawInput,
      title: toolCall.title,
    });
    rememberResultPayload(state, toolCall.content, toolCall.rawOutput);
    this.toolStates.set(toolCall.toolCallId, state);
    const mapped = chunks.map((chunk) => this.normalizeChunk(chunk, state));
    this.rememberEmitted(toolCall.toolCallId, mapped);
    return mapped;
  }

  normalizeToolCallUpdate(toolCallUpdate: AcpToolCallUpdate, chunks: StreamChunk[]): StreamChunk[] {
    const state = this.updateToolState(this.toolStates.get(toolCallUpdate.toolCallId), {
      kind: toolCallUpdate.kind,
      locations: toolCallUpdate.locations,
      rawInput: toolCallUpdate.rawInput,
      title: toolCallUpdate.title,
    });
    rememberResultPayload(state, toolCallUpdate.content, toolCallUpdate.rawOutput);
    this.toolStates.set(toolCallUpdate.toolCallId, state);

    const normalizedName = this.adapter.normalizeToolName(state.rawName);
    const resolvedInput = this.resolveInput(state);
    const result: StreamChunk[] = [];
    if (this.shouldReemitToolUse(toolCallUpdate, resolvedInput, normalizedName)) {
      result.push({
        id: toolCallUpdate.toolCallId,
        input: resolvedInput,
        name: normalizedName,
        type: 'tool_use',
      });
    }

    for (const chunk of chunks) {
      result.push(this.normalizeChunk(chunk, state));
    }

    this.rememberEmitted(toolCallUpdate.toolCallId, result);
    return result;
  }

  // A later update re-emits its tool_use when the rendered name OR input changed
  // since the last emission — otherwise the consumer keeps the stale tool row.
  // `rawInput` is always a re-emit; a corrected kind changes the name; a
  // `locations`-seeded path changes the input without either of those.
  private shouldReemitToolUse(
    toolCallUpdate: AcpToolCallUpdate,
    resolvedInput: Record<string, unknown>,
    normalizedName: string,
  ): boolean {
    if (toolCallUpdate.rawInput !== undefined) {
      return true;
    }
    const id = toolCallUpdate.toolCallId;
    const previousName = this.emittedNames.get(id);
    if (previousName !== undefined && previousName !== normalizedName) {
      return true;
    }
    const previousInput = this.emittedInputs.get(id);
    return previousInput !== undefined && !shallowEqualInput(previousInput, resolvedInput);
  }

  private rememberEmitted(toolCallId: string, chunks: StreamChunk[]): void {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];
      if (chunk.type === 'tool_use') {
        this.emittedNames.set(toolCallId, chunk.name);
        this.emittedInputs.set(toolCallId, chunk.input);
        return;
      }
    }
  }

  private updateToolState(
    current: AcpToolStreamState | undefined,
    update: {
      kind?: string | null;
      locations?: AcpToolCallLocation[] | null;
      rawInput?: unknown;
      title?: string | null;
    },
  ): AcpToolStreamState {
    const nextRawName = this.adapter.resolveRawToolName(current?.rawName, update);
    const state = this.selectBaseState(current, update, nextRawName);
    // `input` stays the pure provider projection; the `locations` fallback is
    // applied at emit (resolveInput). Persisting the seed would let a stale path
    // from an earlier `locations` block masquerade as provider input and block a
    // later `locations` update from replacing it.
    state.locations = update.locations ?? current?.locations;
    return state;
  }

  // Fall back to the canonical path field for Read/Write/Edit/LS when the
  // provider's own input mapping produced none, so they show the file the
  // renderer keys off `input.file_path`/`input.path`. Sources, in precedence:
  // provider input, then `locations`, then a diff `content` block's path
  // (Cursor's captured edit delivers the touched file only in the terminal
  // diff). Computed at emit so a changed source always re-seeds from the
  // path-less provider input; a no-op returns the same input reference.
  private resolveInput(state: AcpToolStreamState): Record<string, unknown> {
    const name = this.adapter.normalizeToolName(state.rawName);
    const withLocation = seedFileToolPathFromLocations(name, state.input, state.locations);
    return applyFileToolPath(name, withLocation, firstDiffContentPath(state.content));
  }

  // Pick the base state before location seeding: re-normalize from accumulated
  // raw input, rebuild on a name change, or reuse the prior state unchanged.
  private selectBaseState(
    current: AcpToolStreamState | undefined,
    update: { rawInput?: unknown; title?: string | null },
    nextRawName: string,
  ): AcpToolStreamState {
    if (update.rawInput !== undefined) {
      const rawInput = { ...current?.rawInput, ...normalizeRawToolInput(update.rawInput) };
      return this.buildToolState(nextRawName, rawInput, current, update.title);
    }
    if (nextRawName !== current?.rawName) {
      return this.buildToolState(nextRawName, current?.rawInput ?? {}, current, update.title);
    }
    return current ?? this.buildToolState(nextRawName, {}, undefined, update.title);
  }

  private buildToolState(
    rawName: string,
    rawInput: Record<string, unknown>,
    previous: AcpToolStreamState | undefined,
    title?: string | null,
  ): AcpToolStreamState {
    const state: AcpToolStreamState = {
      input: this.adapter.normalizeToolInput(rawName, rawInput, title),
      rawInput,
      rawName,
    };
    if (previous) {
      rememberResultPayload(state, previous.content, previous.rawOutput);
    }
    return state;
  }

  private normalizeChunk(chunk: StreamChunk, state: AcpToolStreamState): StreamChunk {
    switch (chunk.type) {
      case 'tool_use':
        return {
          ...chunk,
          input: this.resolveInput(state),
          name: this.adapter.normalizeToolName(state.rawName),
        };
      case 'tool_result': {
        const toolUseResult = this.adapter.normalizeToolUseResult(
          state.rawName,
          this.resolveInput(state),
          state.rawOutput,
          state.content,
        );
        return toolUseResult
          ? { ...chunk, toolUseResult }
          : chunk;
      }
      default:
        return chunk;
    }
  }
}

// Path from the first diff `content` block, if any. Some ACP edits (Cursor's
// captured shape) carry the touched file only in the terminal diff, not in
// `rawInput` or `locations`.
function firstDiffContentPath(content: AcpToolCallContent[] | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  for (const item of content) {
    if (item.type === 'diff' && typeof item.path === 'string' && item.path.trim()) {
      return item.path.trim();
    }
  }
  return undefined;
}

// Shallow value equality over own keys — enough to detect whether a location
// seed added or changed the single path field the renderer reads.
function shallowEqualInput(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) {
    return true;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every((key) => Object.is(a[key], b[key]));
}

function rememberResultPayload(
  state: AcpToolStreamState,
  content: AcpToolCallContent[] | null | undefined,
  rawOutput: unknown,
): void {
  if (Array.isArray(content) && content.length > 0) {
    state.content = content;
  }
  if (rawOutput !== undefined) {
    state.rawOutput = rawOutput;
  }
}

function normalizeRawToolInput(rawInput: unknown): Record<string, unknown> {
  return rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
    ? rawInput as Record<string, unknown>
    : {};
}
