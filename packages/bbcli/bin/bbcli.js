#!/usr/bin/env node
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = process.platform === "win32" ? "bbcli.exe" : "bbcli";
const srcLauncher = path.join(os.homedir(), ".bbcli", "src", "packages", "coding-agent", "scripts", "bbcli");
const vendor = path.join(root, "vendor", exe);
const target = fs.existsSync(srcLauncher) ? srcLauncher : vendor;
if (!fs.existsSync(target)) {
	console.error("bbcli is not installed. Reinstall: npm i -g @badryansah99/bbcli");
	console.error(
		"or: curl -fsSL https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.sh | sh",
	);
	process.exit(1);
}
const child = spawn(target, process.argv.slice(2), { stdio: "inherit" });
child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});
