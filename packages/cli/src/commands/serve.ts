import { createRequire } from "node:module";
import { isIPv4 } from "node:net";
import { dirname, join } from "node:path";
import {
  lastPositional,
  parseArgs,
  parsePort,
  readNumberOption,
  readStringOption,
} from "../args.js";
import { errorMessage } from "../errors.js";
import { normalizeDisplayHost, resolveDatabasePath } from "../paths.js";

export async function serveCommand(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs(args, {
      flags: ["--studio", "--allow-remote"],
      values: {
        "--host": { missing: "Missing host after --host" },
        "--port": { missing: "Missing port after --port", parse: parsePort },
        "--db": { missing: "Missing database path after --db" },
      },
      rejectUnknown: true,
    });
    const target = lastPositional(parsed, process.cwd());
    const host = readStringOption(parsed, "--host");
    const port = readNumberOption(parsed, "--port");
    if (host !== undefined && !isLoopbackHost(host) && !parsed.flags.has("--allow-remote")) {
      throw new Error(
        `Refusing to listen on ${host}: Plico has no authentication. Pass --allow-remote to expose it.`,
      );
    }
    const databasePath = resolveDatabasePath(target, readStringOption(parsed, "--db"));
    const studioPath = parsed.flags.has("--studio") ? resolveStudioPath() : undefined;

    const { servePlico } = await import("@plico/server");
    const server = await servePlico({
      projectRoot: target,
      databasePath,
      ...(host === undefined ? {} : { host }),
      ...(port === undefined ? {} : { port }),
      ...(studioPath === undefined ? {} : { studioPath }),
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine the listening address.");
    }

    const resolvedHost = normalizeDisplayHost(host ?? "127.0.0.1");
    console.log(`Serving Plico at http://${resolvedHost}:${address.port}`);
    console.log(`Database: ${databasePath}`);
    return 0;
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}

function resolveStudioPath(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@plico/studio/package.json");
    return join(dirname(pkgPath), "dist");
  } catch {
    throw new Error(
      "Cannot resolve @plico/studio. Build it first with: pnpm --filter @plico/studio build",
    );
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || (isIPv4(host) && host.startsWith("127."));
}
