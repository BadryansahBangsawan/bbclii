import { describe, expect, it } from "bun:test";
import { InternalUrlRouter } from "@bbcli/pi-coding-agent/internal-urls";

describe("OmpProtocolHandler", () => {
	it("treats bbcli://docs as the documentation root", async () => {
		const resource = await InternalUrlRouter.instance().resolve("bbcli://docs");

		expect(resource.content).toContain("# Documentation");
		expect(resource.content).toContain("tools/read.md");
	});

	it("resolves docs-prefixed documentation paths", async () => {
		const router = InternalUrlRouter.instance();
		const direct = await router.resolve("bbcli://tools/read.md");
		const prefixed = await router.resolve("bbcli://docs/tools/read.md");

		expect(prefixed.content).toBe(direct.content);
		expect(prefixed.content).toContain("# read");
	});
});
