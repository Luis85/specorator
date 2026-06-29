/**
 * Shared ts-jest base for `jest.config.js` (unit/integration projects) and
 * `jest.perf.config.js` (perf monitoring suite). Keep runner-specific options
 * (testMatch, coverage, displayName) out of this file.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupWindow.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/tests/$1',
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/tests/__mocks__/claude-agent-sdk.ts',
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    '^@modelcontextprotocol/sdk/(.*)$': '<rootDir>/node_modules/@modelcontextprotocol/sdk/dist/cjs/$1',
    // The generated `.hostbundle` (baked by `npm run build`) is gitignored and
    // absent in `test`/`coverage` CI; stub it so `embeddedSource.ts` resolves.
    '\\.hostbundle$': '<rootDir>/tests/__mocks__/hostbundle.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@anthropic-ai/claude-agent-sdk)/)',
  ],
};
