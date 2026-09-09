import { describe, expect, it } from "bun:test";
import { prompt } from "@oh-my-pi/pi-utils";
import planModeApprovedPrompt from "../../src/prompts/system/plan-mode-approved.md" with { type: "text" };
import teamModeActivePrompt from "../../src/prompts/system/team-mode-active.md" with { type: "text" };

const APPROVED_BASE = {
	planFilePath: "local://x-plan.md",
	planContent: "body",
	contextPreserved: false,
	tools: [] as string[],
};

describe("plan-mode-approved handoff", () => {
	it("fans independent slices through team when team is enabled", () => {
		const rendered = prompt.render(planModeApprovedPrompt, {
			...APPROVED_BASE,
			teamEnabled: true,
			teamSize: 4,
		});
		expect(rendered).toContain("`team: true`");
		expect(rendered).toContain("4");
		expect(rendered).not.toContain("step-by-step");
	});

	it("keeps serial execute instructions when team is disabled", () => {
		const rendered = prompt.render(planModeApprovedPrompt, {
			...APPROVED_BASE,
			teamEnabled: false,
			teamSize: 4,
		});
		expect(rendered).toContain("step-by-step");
		expect(rendered).not.toContain("team: true");
	});
});

describe("team-mode-active plan contract", () => {
	it("binds an approved plan path when one exists", () => {
		const rendered = prompt.render(teamModeActivePrompt, {
			teamSize: 3,
			planFilePath: "local://x-plan.md",
		});
		expect(rendered).toContain("local://x-plan.md");
		expect(rendered).toContain("NEVER re-plan");
	});

	it("omits plan-path contract when no plan is loaded", () => {
		const rendered = prompt.render(teamModeActivePrompt, {
			teamSize: 3,
			planFilePath: "",
		});
		expect(rendered).not.toContain("local://");
	});
});
