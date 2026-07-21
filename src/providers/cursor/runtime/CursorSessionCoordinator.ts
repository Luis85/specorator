import type { PluginContext } from '../../../core/types/PluginContext';
import type { AcpClientConnection, AcpNewSessionResponse } from '../../acp';
import type { CursorAcpCaptureSink } from '../diagnostics/CursorAcpCaptureSink';
import { validateCursorAcpSessionVault } from '../history/cursorSessionOwnership';
import { getCursorState } from '../types';
import type { CursorModelApplicator } from './CursorModelApplicator';
import {
  isCursorAuthenticationFailure,
  isCursorSessionLoadTransportFailure,
} from './cursorRuntimeErrors';
import type { CursorSessionModelState } from './CursorSessionModelState';
import { cursorSessionAdditionalDirectories, cursorSessionRootsEqual } from './cursorSessionRoots';

const CURSOR_LOGIN_MESSAGE =
  'Cursor CLI is not authenticated. Run `cursor-agent login` in a terminal, then retry.';

interface CursorSessionCoordinatorDeps {
  /** Live handle to the ACP connection, which the runtime swaps across respawns. */
  getConnection: () => AcpClientConnection | null;
  readonly plugin: PluginContext;
  readonly capture: CursorAcpCaptureSink;
  readonly sessionModel: CursorSessionModelState;
  readonly modelApplicator: CursorModelApplicator;
  /** Conversation this per-tab runtime is bound to (for session-id persistence). */
  getBoundConversationId: () => string | null;
  /** Runtime error formatter (folds in the live process stderr snapshot). */
  formatRuntimeError: (error: unknown) => string;
}

/**
 * Owns Cursor session identity and lifecycle: opening/loading/creating the ACP
 * session, authenticating, and applying the collaboration mode. Split out of
 * CursorChatRuntime so the runtime file stays focused on turn/process/stream
 * orchestration. The identity fields are public and shared by reference — the
 * runtime proxies them through get/set accessors so its turn/notification code
 * (and the white-box unit suite) keep reading `sessionId`/`currentModeId`/…
 * exactly as before.
 */
export class CursorSessionCoordinator {
  sessionId: string | null = null;
  loadedSessionId: string | null = null;
  sessionInvalidated = false;
  activeSessionRoots: string[] = [];
  currentModeId: string | null = null;
  lastStartupErrorMessage: string | null = null;

  private readonly getConnection: () => AcpClientConnection | null;
  private readonly plugin: PluginContext;
  private readonly capture: CursorAcpCaptureSink;
  private readonly sessionModel: CursorSessionModelState;
  private readonly modelApplicator: CursorModelApplicator;
  private readonly getBoundConversationId: () => string | null;
  private readonly formatRuntimeError: (error: unknown) => string;

  constructor(deps: CursorSessionCoordinatorDeps) {
    this.getConnection = deps.getConnection;
    this.plugin = deps.plugin;
    this.capture = deps.capture;
    this.sessionModel = deps.sessionModel;
    this.modelApplicator = deps.modelApplicator;
    this.getBoundConversationId = deps.getBoundConversationId;
    this.formatRuntimeError = deps.formatRuntimeError;
  }

  async ensureSession(cwd: string, roots: string[] = []): Promise<string | null> {
    const connection = this.getConnection();
    if (!connection) {
      return null;
    }
    // additionalDirectories are fixed at session/new, so a changed external-root
    // selection on a live session needs a fresh one (with history re-injected).
    if (
      this.loadedSessionId
      && this.sessionId === this.loadedSessionId
      && !cursorSessionRootsEqual(this.activeSessionRoots, roots)
    ) {
      this.sessionInvalidated = true;
      this.sessionId = null;
      this.loadedSessionId = null;
    }
    if (this.sessionId && this.loadedSessionId === this.sessionId) {
      return this.sessionId;
    }

    if (this.sessionId) {
      const requestedId = this.sessionId;
      const ownershipError = validateCursorAcpSessionVault(requestedId, cwd);
      if (ownershipError) {
        this.lastStartupErrorMessage = ownershipError.message;
        this.plugin.logger.scope('cursor.acp').warn(
          'refusing to load Cursor session from another workspace',
          ownershipError,
        );
        return null;
      }
      try {
        const response = await connection.loadSession({
          cwd,
          mcpServers: [],
          sessionId: requestedId,
          additionalDirectories: cursorSessionAdditionalDirectories(roots),
        });
        // Real Cursor session/load responses carry no sessionId (verified against
        // ACP wire captures 2026-07-12); the loaded session keeps the id we asked
        // to load. Adopting the response's absent id here would abort the resumed
        // turn ("Failed to open a Cursor session") and silently discard the load.
        const loadedId = response.sessionId ?? requestedId;
        this.loadedSessionId = loadedId;
        this.sessionId = loadedId;
        this.activeSessionRoots = roots;
        this.modelApplicator.captureAdvertisedModelValues(response);
        this.capture.event('session_load', { sessionId: loadedId });
        return loadedId;
      } catch (error) {
        let loadError = error;
        if (isCursorAuthenticationFailure(loadError) && await this.tryAuthenticate()) {
          // Re-read the connection after authenticating: a force-respawn during
          // tryAuthenticate() swaps it, so the retry must target the live
          // connection, not the disposed one captured at the top of this method.
          const authedConnection = this.getConnection();
          if (authedConnection) {
            try {
              const retryResponse = await authedConnection.loadSession({
                cwd,
                mcpServers: [],
                sessionId: requestedId,
                additionalDirectories: cursorSessionAdditionalDirectories(roots),
              });
              const loadedId = retryResponse.sessionId ?? requestedId;
              this.loadedSessionId = loadedId;
              this.sessionId = loadedId;
              this.activeSessionRoots = roots;
              this.modelApplicator.captureAdvertisedModelValues(retryResponse);
              this.capture.event('session_load', { sessionId: loadedId, retriedAfterAuth: true });
              return loadedId;
            } catch (retryError) {
              loadError = retryError;
            }
          }
        }

        if (isCursorSessionLoadTransportFailure(loadError)) {
          // Preserve the requested session id so a transient transport failure
          // can retry on the next turn instead of minting a fresh session.
          this.plugin.logger.scope('cursor.acp')
            .warn('session/load transport failure; preserving session id', loadError);
          this.lastStartupErrorMessage = this.formatRuntimeError(loadError);
          this.capture.event('session_load_transport_failure', { sessionId: requestedId });
          return null;
        }

        // Load-bearing no-spike fallback: an id-mapping mismatch degrades to a
        // fresh session with history re-injected on the next prompt.
        this.plugin.logger.scope('cursor.acp').warn(
          'session/load failed; falling back to new session',
          loadError,
        );
        this.capture.event('session_load_fallback');
        this.sessionInvalidated = true;
        this.sessionId = null;
        this.loadedSessionId = null;
      }
    }

    return this.createSession(cwd, roots);
  }

  async createSession(cwd: string, roots: string[] = []): Promise<string | null> {
    const connection = this.getConnection();
    if (!connection) {
      return null;
    }
    // Committing to a session opened with exactly these roots; track them so the
    // next turn's ensureSession only recreates when the selection actually changes.
    this.activeSessionRoots = roots;
    const additionalDirectories = cursorSessionAdditionalDirectories(roots);
    try {
      return await this.adoptFreshSession(
        await connection.newSession({ cwd, mcpServers: [], additionalDirectories }),
      );
    } catch (error) {
      if (isCursorAuthenticationFailure(error) && await this.tryAuthenticate()) {
        // Re-read the connection after authenticating: a force-respawn during
        // tryAuthenticate() swaps it, so the retry targets the live connection,
        // not the disposed one captured at the top of this method.
        const authedConnection = this.getConnection();
        if (authedConnection) {
          try {
            return await this.adoptFreshSession(
              await authedConnection.newSession({ cwd, mcpServers: [], additionalDirectories }),
            );
          } catch (retryError) {
            this.lastStartupErrorMessage = this.formatRuntimeError(retryError);
            return null;
          }
        }
      }
      this.lastStartupErrorMessage = isCursorAuthenticationFailure(error)
        ? `${CURSOR_LOGIN_MESSAGE}\n\n${this.formatRuntimeError(error)}`
        : this.formatRuntimeError(error);
      return null;
    }
  }

  async adoptFreshSession(response: AcpNewSessionResponse): Promise<string> {
    this.loadedSessionId = response.sessionId;
    this.sessionId = response.sessionId;
    this.currentModeId = null;
    this.sessionModel.reset();
    this.modelApplicator.captureAdvertisedModelValues(response, false);
    this.sessionModel.forceReapply();
    await this.modelApplicator.persistAdvertisedModelState()
      .catch((error) => this.plugin.logger.scope('cursor.acp').warn('persist fresh model state failed', error));
    this.capture.event('session_new', { sessionId: response.sessionId });
    await this.persistNewSessionId(response.sessionId);
    return response.sessionId;
  }

  private async persistNewSessionId(sessionId: string): Promise<void> {
    const conversationId = this.getBoundConversationId();
    if (!conversationId) return;
    const conversation = this.plugin.getConversationSync(conversationId);
    if (!conversation) return;
    const existingState = getCursorState(conversation.providerState);
    if (existingState.chatSessionId === sessionId && conversation.sessionId === sessionId) {
      return;
    }
    try {
      await this.plugin.updateConversation(conversationId, {
        sessionId,
        providerState: { ...existingState, chatSessionId: sessionId },
      });
    } catch (error) {
      this.plugin.logger.scope('cursor.acp').warn('persist new session id failed', error);
    }
  }

  private async tryAuthenticate(): Promise<boolean> {
    const connection = this.getConnection();
    if (!connection) {
      return false;
    }
    try {
      await connection.authenticate({ methodId: 'cursor_login' });
      return true;
    } catch {
      return false;
    }
  }

  async applyMode(sessionId: string, modeId: string): Promise<void> {
    const connection = this.getConnection();
    if (!connection || this.currentModeId === modeId) {
      return;
    }
    try {
      await connection.setMode({ modeId, sessionId });
      this.currentModeId = modeId;
      this.capture.event('mode_apply', { modeId, ok: true });
    } catch (error) {
      // Mode setting is best-effort: an agent that rejects setMode still runs
      // the turn in its default mode; approvals remain client-enforced.
      this.plugin.logger.scope('cursor.acp').warn('setMode failed', error);
      this.capture.event('mode_apply', { modeId, ok: false });
    }
  }
}
