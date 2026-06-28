import type {
  CodexExecutionPlatformFamily,
  CodexLaunchSpec,
} from '../../../../../src/providers/codex/runtime/codexLaunchTypes';
import {
  mapHostPathToTarget,
  mapRequiredHostPathsToTarget,
  toHostSessionPath,
  toTargetSessionPath,
} from '../../../../../src/providers/codex/runtime/codexSessionPathMapping';

function makeLaunchSpec(
  platformFamily: CodexExecutionPlatformFamily,
  mapper: Partial<CodexLaunchSpec['pathMapper']>,
): CodexLaunchSpec {
  const target: CodexLaunchSpec['target'] = {
    method: 'host-native',
    platformFamily,
    platformOs: platformFamily === 'windows' ? 'windows' : 'linux',
  };
  return {
    target,
    command: 'codex',
    args: [],
    spawnCwd: '/vault',
    targetCwd: '/vault',
    env: {},
    pathMapper: {
      target,
      toTargetPath: () => null,
      toHostPath: () => null,
      mapTargetPathList: (paths) => paths,
      canRepresentHostPath: () => true,
      ...mapper,
    },
  };
}

describe('codexSessionPathMapping', () => {
  describe('toHostSessionPath', () => {
    it('returns null for empty input', () => {
      expect(toHostSessionPath(null, undefined)).toBeNull();
      expect(toHostSessionPath(null, '')).toBeNull();
    });

    it('passes through when there is no launch spec', () => {
      expect(toHostSessionPath(null, '/wsl/path')).toBe('/wsl/path');
    });

    it('maps through the path mapper, falling back to the input', () => {
      const spec = makeLaunchSpec('unix', { toHostPath: (p) => `/host${p}` });
      expect(toHostSessionPath(spec, '/target/x')).toBe('/host/target/x');

      const nullSpec = makeLaunchSpec('unix', { toHostPath: () => null });
      expect(toHostSessionPath(nullSpec, '/target/x')).toBe('/target/x');
    });
  });

  describe('toTargetSessionPath', () => {
    it('returns null for empty input and passes through without a spec', () => {
      expect(toTargetSessionPath(null, null)).toBeNull();
      expect(toTargetSessionPath(null, '/abs')).toBe('/abs');
    });

    it('leaves already-native paths untouched per platform family', () => {
      const unix = makeLaunchSpec('unix', { toTargetPath: () => '/should-not-be-used' });
      expect(toTargetSessionPath(unix, '/already/target')).toBe('/already/target');

      const win = makeLaunchSpec('windows', { toTargetPath: () => 'X:\\should-not-be-used' });
      expect(toTargetSessionPath(win, 'C:\\already')).toBe('C:\\already');
      expect(toTargetSessionPath(win, '\\\\unc\\share')).toBe('\\\\unc\\share');
    });

    it('maps host paths into the target, falling back to the input', () => {
      const spec = makeLaunchSpec('unix', { toTargetPath: (p) => `/mnt${p}` });
      expect(toTargetSessionPath(spec, 'relative/path')).toBe('/mntrelative/path');

      const nullSpec = makeLaunchSpec('unix', { toTargetPath: () => null });
      expect(toTargetSessionPath(nullSpec, 'relative/path')).toBe('relative/path');
    });
  });

  describe('mapHostPathToTarget', () => {
    it('returns null for empty input and passes through without a spec', () => {
      expect(mapHostPathToTarget(null, undefined)).toBeNull();
      expect(mapHostPathToTarget(null, '/host/x')).toBe('/host/x');
    });

    it('maps via the path mapper with input fallback', () => {
      const spec = makeLaunchSpec('unix', { toTargetPath: (p) => `/mnt${p}` });
      expect(mapHostPathToTarget(spec, '/host/x')).toBe('/mnt/host/x');
    });
  });

  describe('mapRequiredHostPathsToTarget', () => {
    it('passes the list through unchanged without a spec', () => {
      expect(mapRequiredHostPathsToTarget(null, ['/a', '/b'], 'ctx')).toEqual(['/a', '/b']);
    });

    it('maps every path, throwing a labeled error when one is unrepresentable', () => {
      const spec = makeLaunchSpec('unix', { toTargetPath: (p) => `/mnt${p}` });
      expect(mapRequiredHostPathsToTarget(spec, ['/a', '/b'], 'ctx')).toEqual(['/mnt/a', '/mnt/b']);

      const failing = makeLaunchSpec('unix', { toTargetPath: () => null });
      expect(() => mapRequiredHostPathsToTarget(failing, ['/a'], 'external context path')).toThrow(
        /external context path.*\/a/,
      );
    });
  });
});
