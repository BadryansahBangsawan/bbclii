import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Settings } from "@bbcli/pi-coding-agent/config/settings";
import { FileClaimBoard } from "@bbcli/pi-coding-agent/task/file-claim";
import { WriteTool } from "@bbcli/pi-coding-agent/tools/write";

describe("WriteTool team claims", () => {
	let tmp = "";

	afterEach(async () => {
		if (tmp) await fs.rm(tmp, { recursive: true, force: true });
		tmp = "";
	});

	it("lets A write a file and rejects B writing the same path", async () => {
		tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bbcli-file-claim-"));
		const board = new FileClaimBoard(tmp);
		const settings = Settings.isolated({});
		const sessionA = {
			cwd: tmp,
			hasUI: false,
			settings,
			fileClaimBoard: board,
			getAgentId: () => "A",
			getSessionFile: () => null,
			getSessionSpawns: () => "*",
		};
		const sessionB = { ...sessionA, getAgentId: () => "B" };
		const writeA = new WriteTool(sessionA as never);
		const writeB = new WriteTool(sessionB as never);

		const ok = await writeA.execute("w1", { path: "foo.ts", content: "hello\n" });
		expect(ok.isError).toBeFalsy();
		expect(await Bun.file(path.join(tmp, "foo.ts")).text()).toBe("hello\n");

		let message = "";
		try {
			const result = await writeB.execute("w2", { path: "foo.ts", content: "bye\n" });
			message = result.content.find(part => part.type === "text")?.text ?? "";
			expect(result.isError).toBe(true);
		} catch (err) {
			message = err instanceof Error ? err.message : String(err);
		}
		expect(message).toContain("claimed by A");
		expect(await Bun.file(path.join(tmp, "foo.ts")).text()).toBe("hello\n");
	});
});
