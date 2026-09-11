#!/usr/bin/env bun
/**
 * Rewrite `@oh-my-pi/` TypeScript import/export specifiers to `@bbcli/`.
 *
 * Used after merging official OMP into this fork (CI sync workflow and
 * source `bbcli update`). Idempotent: a tree that already uses `@bbcli/`
 * is a no-op (exit 0).
 *
 * Only module specifiers are rewritten — URL strings such as
 * `https://registry.npmjs.org/@oh-my-pi/pi-natives-…` are left intact.
 */
import * as path from "node:path";
import { Glob } from "bun";

const DEFAULT_CWD = process.cwd();

/** Import/export/`import()` specifiers that start with `@oh-my-pi/`. */
const SPEC_RE = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])@oh-my-pi\//g;

const SKIP_BASENAMES = new Set(["rebrand-oh-my-pi-imports.test.ts"]);

const SCAN_PATTERNS = ["packages/**/*.{ts,tsx}", "scripts/**/*.ts"];

export function rewriteOhMyPiSpecifiers(source: string): string {
	return source.replace(SPEC_RE, "$1$2@bbcli/");
}

function shouldSkip(file: string, cwd: string): boolean {
	const base = path.basename(file);
	if (SKIP_BASENAMES.has(base)) return true;
	const rel = path.relative(cwd, file).split(path.sep);
	return rel.includes("node_modules") || rel.includes("dist");
}

export async function collectRebrandTargets(cwd: string = DEFAULT_CWD): Promise<string[]> {
	const files = new Set<string>();
	for (const pattern of SCAN_PATTERNS) {
		for (const f of new Glob(pattern).scanSync({ cwd, absolute: true, onlyFiles: true })) {
			if (!shouldSkip(f, cwd)) files.add(f);
		}
	}
	return [...files].sort();
}

export async function rebrandOhMyPiImports(cwd: string = DEFAULT_CWD): Promise<string[]> {
	const changed: string[] = [];
	for (const file of await collectRebrandTargets(cwd)) {
		const original = await Bun.file(file).text();
		const next = rewriteOhMyPiSpecifiers(original);
		if (next === original) continue;
		await Bun.write(file, next);
		changed.push(path.relative(cwd, file));
	}
	return changed;
}

if (import.meta.main) {
	const changed = await rebrandOhMyPiImports();
	for (const file of changed) console.log(file);
}
