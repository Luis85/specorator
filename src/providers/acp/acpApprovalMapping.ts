import type { ApprovalDecisionOption } from '../../core/runtime/types';
import type { ApprovalDecision } from '../../core/types';
// AcpPermissionOption/AcpPermissionOptionKind already model this shape as the
// raw wire-protocol permission option — reuse rather than redeclare so the
// barrel doesn't export two identically-shaped types under the same name.
import type { AcpPermissionOption, AcpPermissionOptionKind, AcpRequestPermissionResponse } from './types';

export function normalizeApprovalInput(rawInput: unknown): Record<string, unknown> {
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return rawInput as Record<string, unknown>;
  }
  if (rawInput === undefined) {
    return {};
  }
  return { value: rawInput };
}

export function mapApprovalDecision(
  decision: ApprovalDecision,
  options: readonly Pick<AcpPermissionOption, 'kind' | 'optionId'>[],
): AcpRequestPermissionResponse {
  if (decision === 'allow') {
    return selectPermissionOption(options, ['allow_once', 'allow_always']);
  }

  if (decision === 'allow-always') {
    return selectPermissionOption(options, ['allow_always', 'allow_once']);
  }

  if (decision === 'deny') {
    return selectPermissionOption(options, ['reject_once', 'reject_always']);
  }

  if (typeof decision === 'object' && decision.type === 'select-option') {
    return {
      outcome: {
        optionId: decision.value,
        outcome: 'selected',
      },
    };
  }

  return { outcome: { outcome: 'cancelled' } };
}

export function buildAcpApprovalDecisionOptions(
  options: readonly AcpPermissionOption[],
): ApprovalDecisionOption[] {
  return options.map((option) => ({
    ...(option.kind === 'allow_once'
      ? { decision: 'allow' as const }
      : option.kind === 'allow_always'
      ? { decision: 'allow-always' as const }
      : {}),
    label: option.name,
    value: option.optionId,
  }));
}

export function selectPermissionOption(
  options: readonly Pick<AcpPermissionOption, 'kind' | 'optionId'>[],
  preferredKinds: readonly AcpPermissionOptionKind[],
): AcpRequestPermissionResponse {
  for (const kind of preferredKinds) {
    const option = options.find((entry) => entry.kind === kind);
    if (option) {
      return {
        outcome: {
          optionId: option.optionId,
          outcome: 'selected',
        },
      };
    }
  }

  return { outcome: { outcome: 'cancelled' } };
}
