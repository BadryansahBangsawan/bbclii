import * as fs from "node:fs";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "BadryansahBangsawan/bbclii";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;

const platform =
	process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : null;
const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : null;
if (!platform || !arch) {
	console.warn(`bbcli: unsupported platform ${process.platform}/${process.arch}; skip binary download`);
	process.exit(0);
}

const asset = platform === "windows" ? `bbcli-windows-${arch}.exe` : `bbcli-${platform}-${arch}`;
const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;
const vendor = path.join(root, "vendor");
const dest = path.join(vendor, platform === "windows" ? "bbcli.exe" : "bbcli");
fs.mkdirSync(vendor, { recursive: true });

function get(target, redirects = 0) {
	if (redirects > 5) return Promise.reject(new Error("too many redirects"));
	return new Promise((resolve, reject) => {
		https
			.get(target, { headers: { "User-Agent": "bbcli-npm" } }, res => {
				const loc = res.headers.location;
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
					res.resume();
					resolve(get(loc, redirects + 1));
					return;
				}
				if (res.statusCode !== 200) {
					res.resume();
					reject(new Error(`HTTP ${res.statusCode} ${target}`));
					return;
				}
				const out = fs.createWriteStream(dest, { mode: 0o755 });
				res.pipe(out);
				out.on("finish", () => resolve());
				out.on("error", reject);
			})
			.on("error", reject);
	});
}

function latestReleaseTag() {
	const { promise, resolve, reject } = Promise.withResolvers();
	https
		.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
			headers: { "User-Agent": "bbcli-npm", Accept: "application/vnd.github+json" },
		}, res => {
			if (res.statusCode !== 200) {
				res.resume();
				reject(new Error(`HTTP ${res.statusCode} latest release`));
				return;
			}
			const chunks = [];
			res.on("data", c => chunks.push(c));
			res.on("end", () => {
				try {
					const tagName = JSON.parse(Buffer.concat(chunks).toString("utf8")).tag_name;
					if (typeof tagName !== "string" || !tagName) {
						reject(new Error("latest release missing tag_name"));
						return;
					}
					resolve(tagName);
				} catch (err) {
					reject(err);
				}
			});
			res.on("error", reject);
		})
		.on("error", reject);
	return promise;
}


try {
	console.log(`bbcli: fetching ${asset} @${tag}...`);
	try {
		await get(url);
	} catch (first) {
		const latest = await latestReleaseTag();
		if (latest === tag) throw first;
		const fallbackUrl = `https://github.com/${REPO}/releases/download/${latest}/${asset}`;
		console.log(`bbcli: ${tag} missing, fetching ${asset} @${latest}...`);
		await get(fallbackUrl);
	}
	fs.chmodSync(dest, 0o755);
	if (process.platform !== "win32") {
		const localDir = path.join(os.homedir(), ".local", "bin");
		fs.mkdirSync(localDir, { recursive: true });
		const localBin = path.join(localDir, "bbcli");
		fs.copyFileSync(dest, localBin);
		fs.chmodSync(localBin, 0o755);
	}
} catch (err) {
	console.warn(`bbcli: could not download ${url}`);
	console.warn(err instanceof Error ? err.message : err);
	console.warn(
		"Install from source: curl -fsSL https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.sh | sh",
	);
	process.exit(0);
}
