import { isBunTestRuntime } from "@bbcli/pi-utils/env";

process.stdout.write(JSON.stringify(isBunTestRuntime()));
