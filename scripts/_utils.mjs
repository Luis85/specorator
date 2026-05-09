// @ts-check
import { access } from 'node:fs/promises';

/**
 * @param {string} p
 * @returns {Promise<boolean>}
 */
export async function pathExists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}
