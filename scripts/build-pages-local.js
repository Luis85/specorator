#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const buildEnv = {
	...process.env,
	VITE_BASE_URL: '/specorator/app/',
};
const result =
	process.platform === 'win32'
		? spawnSync('npm run build:web', {
				stdio: 'inherit',
				shell: true,
				env: buildEnv,
			})
		: spawnSync('npm', ['run', 'build:web'], {
				stdio: 'inherit',
				env: buildEnv,
			});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

rmSync('_site', { recursive: true, force: true });
mkdirSync(join('_site', 'app'), { recursive: true });
cpSync(join('site', 'index.html'), join('_site', 'index.html'));
cpSync('dist-standalone', join('_site', 'app'), { recursive: true });

console.log('Built local GitHub Pages preview in _site/.');
