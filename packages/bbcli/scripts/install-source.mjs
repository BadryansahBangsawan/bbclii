import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const FORK = "https://github.com/BadryansahBangsawan/bbclii.git";
const OMP = "https://github.com/can1357/oh-my-pi.git";
const SRC_DIR = process.env.BBCLI_SRC_DIR || path.join(os.homedir(), ".bbcli", "src");
const INSTALL_DIR = process.env.BBCLI_INSTALL_DIR || path.join(os.homedir(), ".local", "bin");

function have(cmd) {
	const probe = process.platform === "win32" ? `${cmd}.cmd` : cmd;
	const result = spawnSync(probe, ["--version"], { encoding: "utf8" });
	return result.status === 0;
}

function run(cmd, args, opts = {}) {
	const result = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts });
	if (result.status !== 0) {
		throw new Error(`${cmd} ${args.join(" ")} failed (${result.status})`);
	}
	return result;
}

function git(args, cwd = SRC_DIR) {
	return run("git", args, { cwd });
}

function gitQuiet(args, cwd = SRC_DIR) {
	return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function remoteUrl(name) {
	const result = gitQuiet(["remote", "get-url", name]);
	return result.status === 0 ? result.stdout.trim() : "";
}

function ensureRemotes() {
	const origin = remoteUrl("origin");
	const bbclii = remoteUrl("bbclii");
	if (origin.includes("BadryansahBangsawan/bbclii") && !bbclii) {
		git(["remote", "rename", "origin", "bbclii"]);
	}
	if (!remoteUrl("origin")) {
		git(["remote", "add", "origin", OMP]);
	} else if (!remoteUrl("origin").includes("can1357/oh-my-pi")) {
		git(["remote", "set-url", "origin", OMP]);
	}
	if (!remoteUrl("bbclii")) {
		git(["remote", "add", "bbclii", FORK]);
	}
	const fetch = spawnSync("git", ["fetch", "origin", "main"], { cwd: SRC_DIR, stdio: "inherit" });
	if (fetch.status !== 0) {
		console.warn("bbcli: could not fetch origin/main (official OMP); updates via `bbcli update` later");
	}
}

function writeLauncher() {
	fs.mkdirSync(INSTALL_DIR, { recursive: true });
	const launcher = path.join(INSTALL_DIR, "bbcli");
	const srcCli = path.join(SRC_DIR, "packages", "coding-agent", "scripts", "bbcli");
	const body = `#!/bin/sh
export BUN_INSTALL="\${BUN_INSTALL:-\$HOME/.bun}"
export PATH="\$BUN_INSTALL/bin:\$PATH"
exec "${srcCli}" "$@"
`;
	fs.writeFileSync(launcher, body, { mode: 0o755 });
	fs.chmodSync(launcher, 0o755);
}

function cloneFork() {
	fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true });
	console.log(`bbcli: cloning ${FORK} → ${SRC_DIR}`);
	run("git", ["clone", FORK, SRC_DIR]);
}

try {
	if (process.platform === "win32") {
		console.log("bbcli: Windows npm install uses the GitHub binary");
		process.exit(2);
	}
	if (!have("git") || !have("bun")) {
		console.log("bbcli: git+bun required for source install; falling back to binary");
		process.exit(2);
	}

	const codingAgent = path.join(SRC_DIR, "packages", "coding-agent", "scripts", "bbcli");
	if (fs.existsSync(codingAgent)) {
		console.log(`bbcli: using existing source checkout ${SRC_DIR}`);
	} else {
		if (fs.existsSync(SRC_DIR)) {
			throw new Error(`${SRC_DIR} exists but is not a bbcli checkout`);
		}
		cloneFork();
		run("bun", ["install"], { cwd: SRC_DIR });
	}

	ensureRemotes();
	writeLauncher();
	console.log(`bbcli: source install ready (${INSTALL_DIR}/bbcli)`);
	console.log("bbcli: origin = official OMP; local features stay; `bbcli update` merges origin/main");
} catch (err) {
	console.warn("bbcli: source install failed");
	console.warn(err instanceof Error ? err.message : err);
	process.exit(1);
}
