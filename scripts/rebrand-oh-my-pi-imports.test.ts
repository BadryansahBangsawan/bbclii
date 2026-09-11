import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { rewriteOhMyPiSpecifiers } from "./rebrand-oh-my-pi-imports";

const script = path.join(import.meta.dir, "rebrand-oh-my-pi-imports.ts");
const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTree(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bbcli-rebrand-"));
	tempDirs.push(dir);
	await fs.mkdir(path.join(dir, "packages", "utils"), { recursive: true });
	await fs.mkdir(path.join(dir, "scripts"), { recursive: true });
	return dir;
}

async function runRewriter(cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", script], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

describe("rewriteOhMyPiSpecifiers", () => {
	test("rewrites static and dynamic @oh-my-pi module specifiers", () => {
		const src = [
			'import { x } from "@oh-my-pi/pi-utils";',
			"import { y } from '@oh-my-pi/pi-ai';",
			'export * from "@oh-my-pi/pi-catalog";',
			'const m = await import("@oh-my-pi/pi-tui");',
			'import "@oh-my-pi/pi-natives";',
		].join("\n");
		expect(rewriteOhMyPiSpecifiers(src)).toBe(
			[
				'import { x } from "@bbcli/pi-utils";',
				"import { y } from '@bbcli/pi-ai';",
				'export * from "@bbcli/pi-catalog";',
				'const m = await import("@bbcli/pi-tui");',
				'import "@bbcli/pi-natives";',
			].join("\n"),
		);
	});

	test("leaves npm tarball URLs and already-rebranded imports alone", () => {
		const src = [
			'import { x } from "@bbcli/pi-utils";',
			'const url = "https://registry.npmjs.org/@oh-my-pi/pi-natives-linux-x64/-/pi-natives-linux-x64-1.0.0.tgz";',
		].join("\n");
		expect(rewriteOhMyPiSpecifiers(src)).toBe(src);
	});
});

describe("rebrand-oh-my-pi-imports CLI", () => {
	test("rewrites a packages TS import, is idempotent, and ignores .sh outside scan roots", async () => {
		const dir = await makeTree();
		const tsFile = path.join(dir, "packages", "utils", "index.ts");
		const shFile = path.join(dir, "install.sh");
		await Bun.write(tsFile, 'import { x } from "@oh-my-pi/pi-utils";\n');
		await Bun.write(shFile, "https://registry.npmjs.org/@oh-my-pi/pi-natives-linux-x64\n");

		const first = await runRewriter(dir);
		expect(first.exitCode, first.stderr).toBe(0);
		expect(first.stdout).toContain(path.join("packages", "utils", "index.ts"));
		expect(await Bun.file(tsFile).text()).toBe('import { x } from "@bbcli/pi-utils";\n');
		expect(await Bun.file(shFile).text()).toBe("https://registry.npmjs.org/@oh-my-pi/pi-natives-linux-x64\n");

		const second = await runRewriter(dir);
		expect(second.exitCode, second.stderr).toBe(0);
		expect(second.stdout.trim()).toBe("");
		expect(await Bun.file(tsFile).text()).toBe('import { x } from "@bbcli/pi-utils";\n');
	});
});
