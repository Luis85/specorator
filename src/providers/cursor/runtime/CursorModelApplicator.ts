import { Notice } from 'obsidian';

import type { ChatRuntimeQueryOptions } from '../../../core/runtime/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { asSettingsBag } from '../../../core/types/settings';
import { t } from '../../../i18n/i18n';
import type {
  AcpClientConnection,
  AcpLoadSessionResponse,
  AcpNewSessionResponse,
} from '../../acp';
import type { CursorAcpCaptureSink } from '../diagnostics/CursorAcpCaptureSink';
import { buildCursorAgentEnvironment } from './cursorAgentEnv';
import { getCachedCursorModelIds } from './cursorModelCatalog';
import { resolveActiveCursorModel, resolveCursorSessionModelId } from './cursorModelResolution';
import type { CursorSessionModelState } from './CursorSessionModelState';
import {
  loadCursorSessionModelState,
  saveCursorSessionModelState,
} from './cursorSessionModelStore';

interface CursorModelApplicatorDeps {
  /**
   * The runtime's own session-model state, shared by reference: the applicator
   * mutates it and the runtime keeps reading it (usage window, session updates).
   */
  readonly sessionModel: CursorSessionModelState;
  readonly plugin: PluginContext;
  readonly capture: CursorAcpCaptureSink;
  /** Live handle to the ACP connection, which the runtime swaps across respawns. */
  getConnection: () => AcpClientConnection | null;
  /** Active endpoint identity, set by the runtime on each process start. */
  getActiveCliKey: () => string | null;
}

/**
 * Owns Cursor model selection: which model the turn should run on, matching it
 * against the agent-advertised values, applying it via `set_config_option`, and
 * persisting the advertised catalog. Split out of CursorChatRuntime so the
 * runtime file stays focused on turn/session/process orchestration; the
 * session-model state itself still lives on the runtime and is shared here by
 * reference.
 */
export class CursorModelApplicator {
  private readonly sessionModel: CursorSessionModelState;
  private readonly plugin: PluginContext;
  private readonly capture: CursorAcpCaptureSink;
  private readonly getConnection: () => AcpClientConnection | null;
  private readonly getActiveCliKey: () => string | null;

  constructor(deps: CursorModelApplicatorDeps) {
    this.sessionModel = deps.sessionModel;
    this.plugin = deps.plugin;
    this.capture = deps.capture;
    this.getConnection = deps.getConnection;
    this.getActiveCliKey = deps.getActiveCliKey;
  }

  resolveActiveModel(queryOptions?: ChatRuntimeQueryOptions): string | null {
    return resolveActiveCursorModel(queryOptions, asSettingsBag(this.plugin.settings));
  }

  // Model catalog for the ACTIVE endpoint (cli + env incl. CURSOR_BASE_URL) so
  // selection/advertised matching never resolve against a prior endpoint's ids.
  private getActiveCursorCatalogIds(): string[] {
    const cli = this.plugin.getResolvedProviderCliPath('cursor') ?? undefined;
    return getCachedCursorModelIds(cli, cli ? buildCursorAgentEnvironment(this.plugin, cli) : undefined);
  }

  private resolveCursorModelForSession(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    return resolveCursorSessionModelId(
      this.resolveActiveModel(queryOptions),
      this.getActiveCursorCatalogIds(),
    );
  }

  captureAdvertisedModelValues(
    response: AcpNewSessionResponse | AcpLoadSessionResponse,
    persist = true,
    expectedRevision?: number,
  ): boolean {
    const result = expectedRevision === undefined
      ? this.sessionModel.capture(response)
      : this.sessionModel.captureAtRevision(response, expectedRevision);
    if (!result) {
      return true;
    }
    if (persist && result.shouldPersist) {
      void this.persistAdvertisedModelState()
        .catch((error) => this.plugin.logger.scope('cursor.acp').warn('persist advertised models failed', error));
    }
    return result.hasAuthoritativeCurrent;
  }

  async persistAdvertisedModelState(): Promise<void> {
    const cliKey = this.getActiveCliKey();
    if (!cliKey || !this.sessionModel.values) {
      return;
    }
    await saveCursorSessionModelState(
      this.plugin.storage.getAdapter(),
      cliKey,
      this.sessionModel.snapshot(),
    );
  }

  async applySelectedModel(
    sessionId: string,
    queryOptions?: ChatRuntimeQueryOptions,
  ): Promise<void> {
    const connection = this.getConnection();
    if (!connection) {
      return;
    }
    const resolved = this.resolveCursorModelForSession(queryOptions);
    if (!resolved) {
      return;
    }
    const advertised = this.sessionModel.values;
    if ((!advertised || advertised.length === 0) && !this.sessionModel.isAuthoritative) {
      const restoreRevision = this.sessionModel.revision;
      const cliKey = this.getActiveCliKey();
      if (cliKey) {
        const persisted = await loadCursorSessionModelState(
          this.plugin.storage.getAdapter(),
          cliKey,
        ).catch(() => null);
        if (persisted) {
          this.sessionModel.restoreAtRevision(persisted, restoreRevision);
        }
      }
    }
    const wireValue = this.sessionModel.match(
      resolved,
      this.getActiveCursorCatalogIds(),
    );
    if (!wireValue) {
      const message = t('provider.cursor.models.applyFailed');
      this.plugin.logger.scope('cursor.acp')
        .warn('no advertised model value matches selection; failing turn', resolved);
      new Notice(message, 8000);
      throw new Error(message);
    }
    if (wireValue === this.sessionModel.currentValue) {
      return;
    }
    try {
      const configRevision = this.sessionModel.revision;
      const response = await connection.setConfigOption({
        configId: this.sessionModel.configId,
        sessionId,
        type: 'select',
        value: wireValue,
      });
      const hasAuthoritativeCurrent = this.captureAdvertisedModelValues({
        configOptions: response.configOptions,
      }, true, configRevision);
      if (!hasAuthoritativeCurrent && this.sessionModel.confirmApplied(wireValue, configRevision)) {
        void this.persistAdvertisedModelState()
          .catch((error) => this.plugin.logger.scope('cursor.acp').warn('persist selected model failed', error));
      }
      if (this.sessionModel.currentValue !== wireValue) {
        throw new Error(t('provider.cursor.models.applyFailed'));
      }
      this.capture.event('model_apply', { value: wireValue, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('provider.cursor.models.applyFailed');
      this.plugin.logger.scope('cursor.acp').warn('setConfigOption(model) failed', error);
      this.capture.event('model_apply', { value: wireValue, ok: false });
      new Notice(message, 8000);
      throw error instanceof Error ? error : new Error(message);
    }
  }
}
