import type { StreamChunk } from '../../core/types';
import type { SDKToolUseResult } from '../../core/types/diff';
import type { AcpToolCall, AcpToolCallContent, AcpToolCallUpdate } from './types';

// `rawInput` is the accumulated wire-shape input; `input` is its normalized
// projection. Both are kept because provider normalizers are not idempotent
// (e.g. Cursor maps `path` → `file_path`), so re-normalizing an already
// normalized object would drop fields — every rebuild starts from raw.
// `content`/`rawOutput` retain the last result payload seen on any update, so a
// terminal status update without its own payload still yields a toolUseResult.
interface AcpToolStreamState {
  content?: AcpToolCallContent[];
  input: Record<string, unknown>;
  rawInput: Record<string, unknown>;
  rawName: string;
  rawOutput?: unknown;
}

export interface AcpToolStreamPresentationAdapter {
  normalizeToolInput(rawName: string | undefined, input: Record<string, unknown>): Record<string, unknown>;
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

  constructor(private readonly adapter: AcpToolStreamPresentationAdapter) {}

  reset(): void {
    this.toolStates.clear();
  }

  normalizeToolCall(toolCall: AcpToolCall, chunks: StreamChunk[]): StreamChunk[] {
    const state = this.updateToolState(undefined, {
      kind: toolCall.kind,
      rawInput: toolCall.rawInput,
      title: toolCall.title,
    });
    rememberResultPayload(state, toolCall.content, toolCall.rawOutput);
    this.toolStates.set(toolCall.toolCallId, state);
    return chunks.map((chunk) => this.normalizeChunk(chunk, state));
  }

  normalizeToolCallUpdate(toolCallUpdate: AcpToolCallUpdate, chunks: StreamChunk[]): StreamChunk[] {
    const state = this.updateToolState(this.toolStates.get(toolCallUpdate.toolCallId), {
      kind: toolCallUpdate.kind,
      rawInput: toolCallUpdate.rawInput,
      title: toolCallUpdate.title,
    });
    rememberResultPayload(state, toolCallUpdate.content, toolCallUpdate.rawOutput);
    this.toolStates.set(toolCallUpdate.toolCallId, state);

    const result: StreamChunk[] = [];
    if (toolCallUpdate.rawInput !== undefined) {
      result.push({
        id: toolCallUpdate.toolCallId,
        input: state.input,
        name: this.adapter.normalizeToolName(state.rawName),
        type: 'tool_use',
      });
    }

    for (const chunk of chunks) {
      result.push(this.normalizeChunk(chunk, state));
    }

    return result;
  }

  private updateToolState(
    current: AcpToolStreamState | undefined,
    update: {
      kind?: string | null;
      rawInput?: unknown;
      title?: string | null;
    },
  ): AcpToolStreamState {
    const nextRawName = this.adapter.resolveRawToolName(current?.rawName, update);

    if (update.rawInput !== undefined) {
      const rawInput = { ...current?.rawInput, ...normalizeRawToolInput(update.rawInput) };
      return this.buildToolState(nextRawName, rawInput, current);
    }

    if (nextRawName !== current?.rawName) {
      return this.buildToolState(nextRawName, current?.rawInput ?? {}, current);
    }

    return current ?? this.buildToolState(nextRawName, {}, undefined);
  }

  private buildToolState(
    rawName: string,
    rawInput: Record<string, unknown>,
    previous: AcpToolStreamState | undefined,
  ): AcpToolStreamState {
    const state: AcpToolStreamState = {
      input: this.adapter.normalizeToolInput(rawName, rawInput),
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
          input: state.input,
          name: this.adapter.normalizeToolName(state.rawName),
        };
      case 'tool_result': {
        const toolUseResult = this.adapter.normalizeToolUseResult(
          state.rawName,
          state.input,
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
