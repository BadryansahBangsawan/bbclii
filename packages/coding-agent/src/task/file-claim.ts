/**
 * In-memory path ownership for a team swarm. Same board is shared by Main and
 * every team sibling so parallel `write`/`edit`/`ast_edit` cannot clobber.
 */
import * as path from "node:path";
import { ToolError } from "../tools/tool-errors";

export class FileClaimError extends Error {
	readonly ownerId: string;
	readonly path: string;

	constructor(ownerId: string, path: string) {
		super(
			`Path ${path} is claimed by ${ownerId}. Message them via hub send (to: "${ownerId}") or pick a different file.`,
		);
		this.name = "FileClaimError";
		this.ownerId = ownerId;
		this.path = path;
	}
}

export interface FileClaimRecord {
	agentId: string;
	path: string;
}

/** Minimal session surface used by mutating tools to auto-claim. */
export interface FileClaimSession {
	fileClaimBoard?: FileClaimBoard;
	getAgentId?: () => string | null;
}

function covers(claimPath: string, target: string): boolean {
	return target === claimPath || target.startsWith(claimPath + path.sep);
}

function overlaps(a: string, b: string): boolean {
	return covers(a, b) || covers(b, a);
}

export class FileClaimBoard {
	readonly #cwd: string;
	#claims: FileClaimRecord[] = [];

	constructor(cwd: string) {
		this.#cwd = cwd;
	}

	/** Normalize with path.resolve(this.#cwd, p). */
	acquire(agentId: string, paths: readonly string[]): void {
		if (paths.length === 0) return;
		for (const raw of paths) {
			const abs = path.resolve(this.#cwd, raw);
			for (const claim of this.#claims) {
				if (!overlaps(claim.path, abs)) continue;
				if (claim.agentId === agentId) {
					// Same agent already covering this path: skip recording a duplicate.
					if (covers(claim.path, abs)) break;
					continue;
				}
				throw new FileClaimError(claim.agentId, abs);
			}
			if (this.#claims.some(claim => claim.agentId === agentId && covers(claim.path, abs))) continue;
			this.#claims.push({ agentId, path: abs });
		}
	}

	release(agentId: string, paths?: readonly string[]): void {
		if (paths === undefined) {
			this.#claims = this.#claims.filter(claim => claim.agentId !== agentId);
			return;
		}
		const drop = new Set(paths.map(raw => path.resolve(this.#cwd, raw)));
		this.#claims = this.#claims.filter(claim => !(claim.agentId === agentId && drop.has(claim.path)));
	}

	owner(raw: string): string | undefined {
		const abs = path.resolve(this.#cwd, raw);
		let best: FileClaimRecord | undefined;
		for (const claim of this.#claims) {
			if (!covers(claim.path, abs)) continue;
			if (!best || claim.path.length > best.path.length) best = claim;
		}
		return best?.agentId;
	}

	list(): ReadonlyArray<FileClaimRecord> {
		return this.#claims.map(claim => ({ agentId: claim.agentId, path: claim.path }));
	}

	clear(): void {
		this.#claims = [];
	}
}

export function assertTeamWritable(session: FileClaimSession, paths: readonly string[]): void {
	if (!session.fileClaimBoard) return;
	const agentId = session.getAgentId?.() ?? "Main";
	try {
		session.fileClaimBoard.acquire(agentId, paths);
	} catch (err) {
		if (err instanceof FileClaimError) throw new ToolError(err.message);
		throw err;
	}
}
