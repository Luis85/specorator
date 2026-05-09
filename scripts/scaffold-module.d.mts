export interface ScaffoldFile {
	readonly role: 'module' | 'events' | 'view' | 'test';
	readonly path: string;
	readonly contents: string;
}

export interface ScaffoldResult {
	readonly created: ReadonlyArray<ScaffoldFile>;
	readonly skipped: ReadonlyArray<ScaffoldFile>;
}

export interface ScaffoldOptions {
	readonly repoRoot: string;
	readonly name: string;
	readonly log?: (message: string) => void;
}

export function isValidModuleName(name: unknown): boolean;
export function toPascalCase(name: string): string;
export function toCamelCase(name: string): string;
export function renderModuleFile(name: string): string;
export function renderEventsFile(name: string): string;
export function renderViewFile(name: string): string;
export function renderTestFile(name: string): string;
export function plannedFiles(repoRoot: string, name: string): ReadonlyArray<ScaffoldFile>;
export function scaffoldModule(options: ScaffoldOptions): Promise<ScaffoldResult>;
export function wiringInstructions(name: string): string;
