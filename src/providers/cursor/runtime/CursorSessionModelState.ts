import type { AcpLoadSessionResponse } from '../../acp';
import {
  extractAcpSessionModelState,
  findAcpSessionConfigSelectOption,
} from '../../acp';
import { matchAdvertisedModelValue } from './cursorAdvertisedModels';
import type { CursorSessionModelSnapshot } from './cursorSessionModelStore';

type CursorSessionModelSource = Pick<
  AcpLoadSessionResponse,
  'configOptions' | 'models'
>;
type CursorModelOption = NonNullable<
  ReturnType<typeof findAcpSessionConfigSelectOption>
>;

export interface CursorSessionModelCaptureResult {
  hasAuthoritativeCurrent: boolean;
  shouldPersist: boolean;
}

export class CursorSessionModelState {
  configId = 'model';
  currentValue: string | null = null;
  values: string[] | null = null;
  isAuthoritative = false;
  revision = 0;

  capture(source: CursorSessionModelSource): CursorSessionModelCaptureResult {
    const modelOption = findAcpSessionConfigSelectOption(source.configOptions, 'model');
    const extracted = extractAcpSessionModelState(source);
    this.captureSelector(modelOption);
    this.captureCurrent(extracted.currentModelId);
    this.captureRevision(Boolean(modelOption), extracted.currentModelId);
    const values = extracted.availableModels
      .map((model) => model.id.trim())
      .filter((id) => id.length > 0);
    this.captureValues(Boolean(modelOption), values);

    return {
      hasAuthoritativeCurrent: extracted.currentModelId !== null,
      shouldPersist: Boolean(modelOption || values.length > 0),
    };
  }

  captureAtRevision(
    source: CursorSessionModelSource,
    expectedRevision: number,
  ): CursorSessionModelCaptureResult | null {
    return this.revision === expectedRevision ? this.capture(source) : null;
  }

  private captureSelector(option: CursorModelOption | null): void {
    if (!option) {
      return;
    }
    this.configId = option.id;
    this.isAuthoritative = true;
  }

  private captureCurrent(current: string | null): void {
    if (current) {
      this.currentValue = current;
    }
  }

  private captureRevision(hasOption: boolean, current: string | null): void {
    if (hasOption || current !== null) {
      this.revision += 1;
    }
  }

  private captureValues(hasOption: boolean, values: string[]): void {
    if (!hasOption && values.length === 0 && this.values?.length) {
      return;
    }
    this.values = values;
  }

  restore(state: CursorSessionModelSnapshot): void {
    this.configId = state.configId;
    this.values = [...state.values];
    this.isAuthoritative = true;
  }

  restoreAtRevision(state: CursorSessionModelSnapshot, expectedRevision: number): boolean {
    if (this.revision !== expectedRevision || this.isAuthoritative) {
      return false;
    }
    this.restore(state);
    return true;
  }

  forceReapply(): void {
    this.currentValue = null;
  }

  confirmApplied(value: string, expectedRevision: number): boolean {
    if (this.revision !== expectedRevision) {
      return false;
    }
    this.currentValue = value;
    return true;
  }

  match(selection: string, knownModelIds?: readonly string[]): string | null {
    return matchAdvertisedModelValue(this.values, selection, knownModelIds);
  }

  snapshot(): CursorSessionModelSnapshot {
    return {
      configId: this.configId,
      values: [...(this.values ?? [])],
    };
  }

  reset(): void {
    this.configId = 'model';
    this.currentValue = null;
    this.values = null;
    this.isAuthoritative = false;
    this.revision += 1;
  }
}
