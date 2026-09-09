import { describe, expect, it } from "bun:test";
import { assertTeamWritable, FileClaimBoard, FileClaimError } from "@oh-my-pi/pi-coding-agent/task/file-claim";
import { ToolError } from "@oh-my-pi/pi-coding-agent/tools/tool-errors";
import { parseTeamCommandArgs } from "../../src/slash-commands/helpers/parse-team-args";

describe("FileClaimBoard", () => {
	it("rejects a sibling acquiring the same file", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("A", ["src/a.ts"]);
		expect(() => board.acquire("B", ["src/a.ts"])).toThrow(FileClaimError);
		try {
			board.acquire("B", ["src/a.ts"]);
		} catch (err) {
			expect(err).toBeInstanceOf(FileClaimError);
			expect((err as FileClaimError).ownerId).toBe("A");
		}
	});

	it("rejects a file under another agent's directory claim", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("A", ["src/"]);
		expect(() => board.acquire("B", ["src/a.ts"])).toThrow(FileClaimError);
		try {
			board.acquire("B", ["src/a.ts"]);
		} catch (err) {
			expect(err).toBeInstanceOf(FileClaimError);
			expect((err as FileClaimError).ownerId).toBe("A");
		}
	});

	it("rejects claiming a directory that covers a sibling's file", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("B", ["src/foo.ts"]);
		expect(() => board.acquire("A", ["src/"])).toThrow(FileClaimError);
		try {
			board.acquire("A", ["src/"]);
		} catch (err) {
			expect(err).toBeInstanceOf(FileClaimError);
			expect((err as FileClaimError).ownerId).toBe("B");
		}
	});

	it("is a no-op when the same agent re-acquires a covered path", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("A", ["src/a.ts"]);
		expect(() => board.acquire("A", ["src/a.ts"])).not.toThrow();
		expect(board.list()).toHaveLength(1);
	});

	it("keeps earlier paths in a mixed acquire when a later path conflicts", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("B", ["src/b.ts"]);
		expect(() => board.acquire("A", ["src/a.ts", "src/b.ts", "src/c.ts"])).toThrow(FileClaimError);
		expect(board.owner("src/a.ts")).toBe("A");
		expect(board.owner("src/b.ts")).toBe("B");
		expect(board.owner("src/c.ts")).toBeUndefined();
	});

	it("drops every claim for an agent on release without paths", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("A", ["src/a.ts", "src/b.ts"]);
		board.release("A");
		expect(() => board.acquire("B", ["src/a.ts"])).not.toThrow();
		expect(board.owner("src/a.ts")).toBe("B");
	});

	it("returns the longest covering claim owner", () => {
		const board = new FileClaimBoard("/tmp/team");
		board.acquire("A", ["src/"]);
		board.acquire("A", ["src/auth/session.ts"]);
		expect(board.owner("src/auth/session.ts")).toBe("A");
		expect(board.owner("src/other.ts")).toBe("A");
	});
});

describe("assertTeamWritable", () => {
	it("is a no-op when the session has no board", () => {
		expect(() => assertTeamWritable({}, ["src/a.ts"])).not.toThrow();
	});

	it("auto-claims on first mutating call and throws ToolError on conflict", () => {
		const board = new FileClaimBoard("/tmp/team");
		assertTeamWritable({ fileClaimBoard: board, getAgentId: () => "A" }, ["src/a.ts"]);
		expect(board.owner("src/a.ts")).toBe("A");
		expect(() => assertTeamWritable({ fileClaimBoard: board, getAgentId: () => "B" }, ["src/a.ts"])).toThrow(
			ToolError,
		);
		try {
			assertTeamWritable({ fileClaimBoard: board, getAgentId: () => "B" }, ["src/a.ts"]);
		} catch (err) {
			expect(err).toBeInstanceOf(ToolError);
			expect((err as ToolError).message).toContain("claimed by A");
		}
	});
});

describe("parseTeamCommandArgs", () => {
	it("toggles on empty input and disables on off", () => {
		expect(parseTeamCommandArgs("", 3, 8)).toEqual({ action: "toggle", size: 3 });
		expect(parseTeamCommandArgs("off", 3, 8)).toEqual({ action: "off", size: 3 });
		expect(parseTeamCommandArgs("OFF", 3, 8)).toEqual({ action: "off", size: 3 });
	});

	it("clamps a leading size and treats the rest as the prompt", () => {
		expect(parseTeamCommandArgs("2", 3, 8)).toEqual({ action: "on", size: 2 });
		expect(parseTeamCommandArgs("1", 3, 8)).toEqual({ action: "on", size: 2 });
		expect(parseTeamCommandArgs("100", 3, 8)).toEqual({ action: "on", size: 8 });
		expect(parseTeamCommandArgs("4 fix auth", 3, 8)).toEqual({
			action: "on",
			size: 4,
			prompt: "fix auth",
		});
		expect(parseTeamCommandArgs("fix auth", 3, 8)).toEqual({
			action: "on",
			size: 3,
			prompt: "fix auth",
		});
	});
});
