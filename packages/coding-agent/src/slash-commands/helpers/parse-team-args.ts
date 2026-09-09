export type TeamCommandAction = "toggle" | "off" | "on";

export interface ParsedTeamCommandArgs {
	action: TeamCommandAction;
	size: number;
	prompt?: string;
}

/** Clamp a settings/CLI integer into `[min, max]`, falling back when NaN/empty. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	return Math.min(max, Math.max(min, Math.trunc(Number(value) || fallback)));
}

/**
 * Parse `/team` args.
 *
 * - `""` → toggle at `defaultSize`
 * - `off` → disable
 * - `<n> [prompt]` → enable with clamped size, optional prompt
 * - otherwise → enable at `defaultSize` with the raw text as prompt
 */
export function parseTeamCommandArgs(raw: string, defaultSize: number, maxSize: number): ParsedTeamCommandArgs {
	const trimmed = raw.trim();
	if (trimmed === "") return { action: "toggle", size: defaultSize };
	if (/^off$/i.test(trimmed)) return { action: "off", size: defaultSize };
	const sizedPrompt = /^(\d+)\s+(.*)$/s.exec(trimmed);
	if (sizedPrompt) {
		const size = clampInt(sizedPrompt[1], 2, maxSize, defaultSize);
		const prompt = sizedPrompt[2]!.trim();
		return prompt ? { action: "on", size, prompt } : { action: "on", size };
	}
	if (/^(\d+)$/.test(trimmed)) {
		return { action: "on", size: clampInt(trimmed, 2, maxSize, defaultSize) };
	}
	return { action: "on", size: defaultSize, prompt: trimmed };
}
