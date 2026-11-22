import type { ProjectConfig, ValidationIssue } from "./types.js";

/** Offline checks only: no server launch, network access, or environment lookup. */
export function validateMcpConfig(value: unknown, configFile: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (field: string, expected: string) => {
    issues.push({ path: configFile, severity: "error", message: `Expected ${field} ${expected}` });
  };
  if (!isRecord(value)) {
    issue("mcpServers", "to be an object");
    return issues;
  }
  for (const [name, server] of Object.entries(value)) {
    const field = `mcpServers.${name}`;
    if (!/^[a-z][a-z0-9_]*$/.test(name))
      issue(field, "to use a server id matching /^[a-z][a-z0-9_]*$/");
    if (!isRecord(server)) {
      issue(field, "to be an object");
      continue;
    }
    if (!validTools(server.tools))
      issue(
        `${field}.tools`,
        "to be an explicit array of unique, non-empty, trimmed tool names without wildcards",
      );
    let keys: string[];
    if (server.transport === "stdio") {
      keys = ["transport", "command", "args", "env", "tools"];
      if (
        typeof server.command !== "string" ||
        !server.command.trim() ||
        server.command.includes("\0")
      )
        issue(`${field}.command`, "to be a non-empty executable name or path");
      if (Object.hasOwn(server, "args") && !strings(server.args))
        issue(`${field}.args`, "to be an array of strings");
      if (Object.hasOwn(server, "env") && !environmentNames(server.env))
        issue(`${field}.env`, "to be an array of unique environment variable names");
    } else if (server.transport === "streamable-http") {
      keys = ["transport", "url", "headersEnv", "tools"];
      if (!endpoint(server.url))
        issue(`${field}.url`, "to be an absolute HTTP(S) URL without credentials or a fragment");
      if (Object.hasOwn(server, "headersEnv") && !headers(server.headersEnv))
        issue(
          `${field}.headersEnv`,
          "to map unique HTTP header names to environment variable names; transport-managed headers (Mcp-Session-Id, Mcp-Protocol-Version, Content-Type, Accept, Host, Content-Length) are reserved",
        );
    } else {
      issue(`${field}.transport`, 'to be "stdio" or "streamable-http"');
      continue;
    }
    for (const key of Object.keys(server))
      if (!keys.includes(key) && key !== "replayOnCrash" && key !== "callTimeoutMs")
        issue(`${field}.${key}`, `to be a supported ${server.transport} field`);
    const allowlist = server.tools;
    if (
      Object.hasOwn(server, "replayOnCrash") &&
      (!validTools(server.replayOnCrash) ||
        !validTools(allowlist) ||
        !server.replayOnCrash.every((name) => allowlist.includes(name)))
    )
      issue(
        `${field}.replayOnCrash`,
        "to contain unique exact tool names from this server's tools allowlist",
      );
    if (
      Object.hasOwn(server, "callTimeoutMs") &&
      (typeof server.callTimeoutMs !== "number" ||
        !Number.isSafeInteger(server.callTimeoutMs) ||
        server.callTimeoutMs <= 0 ||
        server.callTimeoutMs > 2_147_483_647)
    )
      issue(`${field}.callTimeoutMs`, "to be a positive 32-bit integer");
  }
  return issues;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function environmentNames(value: unknown): boolean {
  return (
    strings(value) &&
    value.every((name) => /^[A-Za-z_]\w*$/.test(name)) &&
    new Set(value).size === value.length
  );
}

function headers(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const names = Object.keys(value).map((name) => name.toLowerCase());
  return (
    new Set(names).size === names.length &&
    !names.some((name) =>
      [
        "mcp-session-id",
        "mcp-protocol-version",
        "content-type",
        "accept",
        "host",
        "content-length",
      ].includes(name),
    ) &&
    Object.entries(value).every(
      ([name, variable]) =>
        /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) &&
        typeof variable === "string" &&
        /^[A-Za-z_]\w*$/.test(variable),
    )
  );
}

function endpoint(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() !== value || !/^https?:\/\//i.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !value.includes("#")
    );
  } catch {
    return false;
  }
}

function validTools(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (name) =>
        typeof name === "string" &&
        name.trim() !== "" &&
        name.trim() === name &&
        !name.includes("*"),
    ) &&
    new Set(value).size === value.length
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeMcpConfig(
  servers: NonNullable<ProjectConfig["mcpServers"]>,
): NonNullable<ProjectConfig["mcpServers"]> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      server.transport === "stdio"
        ? {
            transport: server.transport,
            command: server.command,
            tools: [...server.tools],
            ...(server.callTimeoutMs !== undefined ? { callTimeoutMs: server.callTimeoutMs } : {}),
            ...(server.replayOnCrash !== undefined
              ? { replayOnCrash: [...server.replayOnCrash] }
              : {}),
            ...(server.args !== undefined ? { args: [...server.args] } : {}),
            ...(server.env !== undefined ? { env: [...server.env] } : {}),
          }
        : {
            transport: server.transport,
            url: server.url,
            tools: [...server.tools],
            ...(server.callTimeoutMs !== undefined ? { callTimeoutMs: server.callTimeoutMs } : {}),
            ...(server.replayOnCrash !== undefined
              ? { replayOnCrash: [...server.replayOnCrash] }
              : {}),
            ...(server.headersEnv !== undefined ? { headersEnv: { ...server.headersEnv } } : {}),
          },
    ]),
  );
}
