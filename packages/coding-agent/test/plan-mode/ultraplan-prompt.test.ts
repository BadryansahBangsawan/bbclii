import { describe, expect, it } from "bun:test";
import { prompt } from "@bbcli/pi-utils";
import planModeActivePrompt from "../../src/prompts/system/plan-mode-active.md" with { type: "text" };

const BASE = {
	planFilePath: "local://auth-plan.md",
	askToolName: "ask",
	writeToolName: "write",
	editToolName: "edit",
	isHashlineEditMode: false,
	iterative: false,
	askAvailable: true,
	taskAvailable: true,
	scoutAvailable: true,
	reentry: false,
	planExists: false,
	ultraplan: false,
} as const;

type Overrides = Partial<Record<keyof typeof BASE, boolean | string>>;

function render(overrides: Overrides = {}): string {
	return prompt.render(planModeActivePrompt, { ...BASE, ...overrides });
}

describe("ultraplan plan-mode-active prompt", () => {
	it("requires parallel scout fan-out when ultraplan is on", () => {
		const output = render({ ultraplan: true, iterative: false, scoutAvailable: true, taskAvailable: true });
		expect(output).toContain("MUST fan parallel");
		expect(output).not.toContain("Scope spans areas → parallel");
	});

	it("keeps the MAY scout wording when ultraplan is off", () => {
		const output = render({ ultraplan: false, iterative: false, scoutAvailable: true, taskAvailable: true });
		expect(output).toContain("Scope spans areas → parallel");
		expect(output).not.toContain("MUST fan parallel");
	});
});
