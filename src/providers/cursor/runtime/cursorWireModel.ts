export interface CursorWireModel {
  bracketClosed: boolean;
  family: string;
  hasBracket: boolean;
  keyed: Map<string, string>;
  values: Set<string>;
}

export function parseCursorWireModel(wireValue: string): CursorWireModel {
  const start = wireValue.indexOf('[');
  if (start === -1) {
    return {
      bracketClosed: false,
      family: wireValue,
      hasBracket: false,
      keyed: new Map(),
      values: new Set(),
    };
  }

  const end = wireValue.lastIndexOf(']');
  const bracketClosed = end > start;
  const inner = wireValue.slice(start + 1, bracketClosed ? end : undefined);
  const keyed = new Map<string, string>();
  const values = new Set<string>();
  for (const rawSegment of inner.split(',')) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }
    const equals = segment.indexOf('=');
    if (equals === -1) {
      values.add(segment);
      continue;
    }
    const key = segment.slice(0, equals).trim();
    const value = segment.slice(equals + 1).trim();
    values.add(value);
    keyed.set(key, value);
  }

  return {
    bracketClosed,
    family: wireValue.slice(0, start),
    hasBracket: true,
    keyed,
    values,
  };
}

export function cursorWireContextWindow(model: CursorWireModel): number {
  if (!model.bracketClosed) {
    return 0;
  }
  const match = /^(\d+(?:\.\d+)?)([km])?$/iu.exec(model.keyed.get('context') ?? '');
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1;
  const window = value * multiplier;
  return Number.isFinite(window) && window > 0 ? Math.floor(window) : 0;
}
