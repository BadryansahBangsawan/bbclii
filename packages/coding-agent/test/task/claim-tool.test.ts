import { describe, expect, it } from "bun:test";
import { FileClaimBoard } from "@oh-my-pi/pi-coding-agent/task/file-claim";
import { ClaimTool } from "../../src/tools/claim";

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.find(part => part.type === "text")?.text ?? "";
}

describe("ClaimTool", () => {
	it("errors when no team board is attached", async () => {
		const tool = new ClaimTool({ getAgentId: () => "A" } as never);
		const result = await tool.execute("c1", { op: "list" });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("No active team");
	});

	it("requires paths on acquire", async () => {
		const tool = new ClaimTool({
			fileClaimBoard: new FileClaimBoard("/tmp/team"),
			getAgentId: () => "A",
		} as never);
		const result = await tool.execute("c1", { op: "acquire" });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("acquire requires paths");
	});

	it("acquires then lists, and surfaces the sibling owner on conflict", async () => {
		const board = new FileClaimBoard("/tmp/team");
		const toolA = new ClaimTool({ fileClaimBoard: board, getAgentId: () => "A" } as never);
		const toolB = new ClaimTool({ fileClaimBoard: board, getAgentId: () => "B" } as never);

		const acquired = await toolA.execute("c1", { op: "acquire", paths: ["src/a.ts"] });
		expect(acquired.isError).toBeFalsy();
		expect(textOf(acquired)).toContain("`A`");
		expect(textOf(acquired)).toContain("src/a.ts");

		const conflict = await toolB.execute("c2", { op: "acquire", paths: ["src/a.ts"] });
		expect(conflict.isError).toBe(true);
		expect(textOf(conflict)).toContain("claimed by A");

		const released = await toolA.execute("c3", { op: "release" });
		expect(textOf(released)).toBe("(no claims)");
		const ok = await toolB.execute("c4", { op: "acquire", paths: ["src/a.ts"] });
		expect(ok.isError).toBeFalsy();
		expect(textOf(ok)).toContain("`B`");
	});
});
