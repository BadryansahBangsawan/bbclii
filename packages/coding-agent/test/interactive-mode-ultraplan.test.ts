import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import * as path from "node:path";
import { Agent } from "@bbcli/pi-agent-core";
import { ModelRegistry } from "@bbcli/pi-coding-agent/config/model-registry";
import { resetSettingsForTest, Settings } from "@bbcli/pi-coding-agent/config/settings";
import { InteractiveMode } from "@bbcli/pi-coding-agent/modes/interactive-mode";
import { initTheme } from "@bbcli/pi-coding-agent/modes/theme/theme";
import { AgentSession } from "@bbcli/pi-coding-agent/session/agent-session";
import { AuthStorage } from "@bbcli/pi-coding-agent/session/auth-storage";
import { HistoryStorage } from "@bbcli/pi-coding-agent/session/history-storage";
import { SessionManager } from "@bbcli/pi-coding-agent/session/session-manager";
import { TempDir } from "@bbcli/pi-utils";

describe("/ultraplan command", () => {
	let tempDir: TempDir;
	let authStorage: AuthStorage;
	let session: AgentSession;
	let mode: InteractiveMode;

	beforeAll(() => {
		initTheme();
	});

	beforeEach(async () => {
		resetSettingsForTest();
		tempDir = TempDir.createSync("@pi-ultraplan-");
		await Settings.init({ inMemory: true, cwd: tempDir.path() });
		authStorage = await AuthStorage.create(path.join(tempDir.path(), "testauth.db"));
		const modelRegistry = new ModelRegistry(authStorage);
		const defaultModel = modelRegistry.find("anthropic", "claude-sonnet-4-5");
		if (!defaultModel) throw new Error("Expected claude-sonnet-4-5 in registry");

		session = new AgentSession({
			agent: new Agent({
				initialState: {
					model: defaultModel,
					systemPrompt: ["Test"],
					tools: [],
					messages: [],
				},
			}),
			sessionManager: SessionManager.create(tempDir.path(), tempDir.path()),
			settings: Settings.isolated(),
			modelRegistry,
		});
		mode = new InteractiveMode(session, "test");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		mode?.stop();
		HistoryStorage.close();
		await session?.dispose();
		authStorage?.close();
		tempDir?.removeSync();
		resetSettingsForTest();
	});

	it("warns and stays off when plan.enabled is false", async () => {
		session.settings.set("plan.enabled", false);
		const warning = vi.spyOn(mode, "showWarning").mockImplementation(() => {});

		await mode.handleUltraplanCommand();

		expect(mode.planModeEnabled).toBe(false);
		expect(warning).toHaveBeenCalledWith("Plan mode is disabled. Enable it in settings (plan.enabled).");
	});

	it("enters plan mode with parallel workflow and ultraplan true", async () => {
		await mode.handleUltraplanCommand();

		expect(mode.planModeEnabled).toBe(true);
		expect(session.getPlanModeState()).toMatchObject({
			workflow: "parallel",
			ultraplan: true,
		});
	});

	it("upgrades an active /plan session without pausing", async () => {
		await mode.handlePlanModeCommand();
		expect(mode.planModeEnabled).toBe(true);

		await mode.handleUltraplanCommand();

		expect(mode.planModeEnabled).toBe(true);
		expect(mode.planModePaused).toBe(false);
		expect(session.getPlanModeState()).toMatchObject({
			workflow: "parallel",
			ultraplan: true,
		});
	});

	it("submits a non-skill /ultraplan prompt as a normal prompt", async () => {
		const promptCustomMessage = vi.spyOn(session, "promptCustomMessage").mockResolvedValue(true);
		let submitted: { text: string } | undefined;
		mode.onInputCallback = input => {
			submitted = input;
		};

		await mode.handleUltraplanCommand("just plan the migration");

		expect(mode.planModeEnabled).toBe(true);
		expect(promptCustomMessage).not.toHaveBeenCalled();
		expect(submitted?.text).toBe("just plan the migration");
	});
});
