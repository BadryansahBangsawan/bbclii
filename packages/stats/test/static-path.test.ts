import { describe, expect, it } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { resolveDashboardStaticPath, startServer } from "../src/server";
import { installStatsTestIsolation } from "./helpers/temp-agent";

installStatsTestIsolation("@pi-stats-static-path-");

const staticDir = path.resolve(os.tmpdir(), "bbcli-stats-static-jail-fixture");
const root = path.resolve(staticDir);

function expectUnderStaticDir(resolved: string | null): asserts resolved is string {
	expect(resolved).not.toBeNull();
	if (resolved === null) throw new Error("expected a path under staticDir");
	expect(resolved === root || resolved.startsWith(root + path.sep)).toBe(true);
}

async function expectNotHostPasswdBytes(body: string): Promise<void> {
	const hostPasswd = Bun.file("/etc/passwd");
	if (!(await hostPasswd.exists())) return;
	expect(body).not.toBe(await hostPasswd.text());
}

describe("resolveDashboardStaticPath", () => {
	it('maps "/" to index.html under staticDir', () => {
		const resolved = resolveDashboardStaticPath(staticDir, "/");
		expectUnderStaticDir(resolved);
		expect(resolved.endsWith(`${path.sep}index.html`)).toBe(true);
	});

	it('maps "/index.html" to index.html under staticDir', () => {
		const resolved = resolveDashboardStaticPath(staticDir, "/index.html");
		expectUnderStaticDir(resolved);
		expect(resolved.endsWith(`${path.sep}index.html`)).toBe(true);
	});

	it('maps "/assets/app.js" to a path under staticDir', () => {
		const resolved = resolveDashboardStaticPath(staticDir, "/assets/app.js");
		expectUnderStaticDir(resolved);
		expect(path.relative(root, resolved)).toBe(path.join("assets", "app.js"));
	});

	it('rejects "/../../../etc/passwd"', () => {
		expect(resolveDashboardStaticPath(staticDir, "/../../../etc/passwd")).toBeNull();
	});

	it('rejects "/foo/../../../etc/passwd"', () => {
		expect(resolveDashboardStaticPath(staticDir, "/foo/../../../etc/passwd")).toBeNull();
	});

	it('keeps "/etc/passwd" inside staticDir after slash-strip', () => {
		const resolved = resolveDashboardStaticPath(staticDir, "/etc/passwd");
		expectUnderStaticDir(resolved);
		expect(resolved).toBe(path.resolve(staticDir, "etc/passwd"));
		expect(resolved).not.toBe(path.resolve("/etc/passwd"));
		expect(resolved.startsWith(root + path.sep)).toBe(true);
	});
});

describe("dashboard static HTTP jail", () => {
	it("does not serve host /etc/passwd for traversal or slash-stripped absolute paths", async () => {
		const server = await startServer(0);
		try {
			const traversal = await fetch(`http://127.0.0.1:${server.port}/../../../etc/passwd`);
			const traversalBody = await traversal.text();
			expect([200, 404]).toContain(traversal.status);
			await expectNotHostPasswdBytes(traversalBody);

			const stripped = await fetch(`http://127.0.0.1:${server.port}/etc/passwd`);
			const strippedBody = await stripped.text();
			expect([200, 404]).toContain(stripped.status);
			await expectNotHostPasswdBytes(strippedBody);
		} finally {
			server.stop();
		}
	});

	it("serves GET / as 200 when the client index exists", async () => {
		const server = await startServer(0);
		try {
			const response = await fetch(`http://127.0.0.1:${server.port}/`);
			expect(response.status).toBe(200);
			await response.body?.cancel();
		} finally {
			server.stop();
		}
	});
});
