import { type } from "@bbcli/omptype";
import type { AgentTool, AgentToolResult } from "@bbcli/pi-agent-core";
import type { ToolExample } from "@bbcli/pi-ai";
import claimDescription from "../prompts/tools/claim.md" with { type: "text" };
import { FileClaimError, type FileClaimSession } from "../task/file-claim";

const claimSchema = type({
	op: type("'acquire' | 'release' | 'list'").describe("claim operation"),
	"paths?": type("string[]").describe("paths to acquire or release"),
	"+": "delete",
});

type ClaimParams = typeof claimSchema.infer;

function formatClaimList(session: FileClaimSession): string {
	const rows = session.fileClaimBoard?.list() ?? [];
	if (rows.length === 0) return "(no claims)";
	return rows.map(row => `\`${row.agentId}\` \`${row.path}\``).join("\n");
}

function claimResult(text: string, isError?: true): AgentToolResult {
	return isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };
}

export class ClaimTool implements AgentTool<typeof claimSchema> {
	readonly name = "claim";
	readonly label = "Claim";
	readonly loadMode = "essential";
	readonly approval = "read" as const;
	readonly summary = "Acquire or release team file claims";
	readonly description: string;
	readonly parameters = claimSchema;
	readonly strict = true;

	readonly examples: readonly ToolExample<ClaimParams>[] = [
		{
			caption: "Claim a directory up front",
			call: { op: "acquire", paths: ["src/auth"] },
		},
		{
			caption: "List every claim",
			call: { op: "list" },
		},
		{
			caption: "Release this agent's claims",
			call: { op: "release" },
		},
	];

	constructor(private readonly session: FileClaimSession) {
		this.description = claimDescription;
	}

	async execute(_id: string, params: ClaimParams): Promise<AgentToolResult> {
		const board = this.session.fileClaimBoard;
		if (!board) return claimResult("No active team. File claims are inactive.", true);

		const agentId = this.session.getAgentId?.() ?? "Main";
		switch (params.op) {
			case "list":
				return claimResult(formatClaimList(this.session));
			case "acquire": {
				if (!params.paths || params.paths.length === 0) return claimResult("acquire requires paths", true);
				try {
					board.acquire(agentId, params.paths);
				} catch (err) {
					if (err instanceof FileClaimError) return claimResult(err.message, true);
					throw err;
				}
				return claimResult(formatClaimList(this.session));
			}
			case "release":
				if (params.paths && params.paths.length > 0) board.release(agentId, params.paths);
				else board.release(agentId);
				return claimResult(formatClaimList(this.session));
		}
	}
}
