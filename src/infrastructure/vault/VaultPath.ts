import { err, ok, type Result } from '@/domain/shared/Result';

export class UnsafeVaultPathError extends Error {
	constructor(path: string, reason: string) {
		super(`Unsafe vault path "${path}": ${reason}`);
		this.name = 'UnsafeVaultPathError';
	}
}

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:[\\/]/;
const RESERVED_ROOTS = new Set(['.obsidian']);

export function normalizeVaultPath(path: string): Result<string, UnsafeVaultPathError> {
	const original = path;
	const trimmed = path.trim();

	if (!trimmed) return err(new UnsafeVaultPathError(original, 'path must not be empty'));
	if (WINDOWS_DRIVE_PREFIX.test(trimmed)) {
		return err(new UnsafeVaultPathError(original, 'absolute paths are not allowed'));
	}
	if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
		return err(new UnsafeVaultPathError(original, 'absolute paths are not allowed'));
	}

	const parts = trimmed.replace(/\\/g, '/').split('/');
	const normalizedParts: string[] = [];

	for (const part of parts) {
		if (!part || part === '.') continue;
		if (part === '..') {
			return err(new UnsafeVaultPathError(original, 'parent traversal is not allowed'));
		}
		normalizedParts.push(part);
	}

	if (normalizedParts.length === 0) {
		return err(new UnsafeVaultPathError(original, 'path must not be empty'));
	}
	if (RESERVED_ROOTS.has(normalizedParts[0].toLowerCase())) {
		return err(new UnsafeVaultPathError(original, 'reserved vault roots are not plugin-owned'));
	}

	return ok(normalizedParts.join('/'));
}

export function joinVaultPath(...segments: string[]): Result<string, UnsafeVaultPathError> {
	return normalizeVaultPath(segments.join('/'));
}
