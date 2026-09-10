import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function run(script) {
	return spawnSync(process.execPath, [path.join(here, script)], { stdio: "inherit" }).status ?? 1;
}

const source = run("install-source.mjs");
if (source === 0) process.exit(0);

const binary = run("install-binary.mjs");
process.exit(binary);
