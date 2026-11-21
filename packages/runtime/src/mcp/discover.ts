import type { JsonSchema, LoadedProject, McpTool } from "@plico-ai/contracts";

export interface McpDiscoveryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Explicit discovery only. Agent runs do not call this function. */
export async function discoverMcpTools(
  project: LoadedProject,
  options: McpDiscoveryOptions = {},
): Promise<McpTool[]> {
  if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
    throw new Error("MCP discovery timeoutMs must be a positive 32-bit integer.");
  const sources = Object.entries(project.config.mcpServers ?? {});
  if (sources.length === 0) return [];
  const [{ Client, StreamableHTTPClientTransport }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("@modelcontextprotocol/client/stdio"),
  ]);
  const tools: McpTool[] = [];
  for (const [serverId, source] of sources) {
    if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
    const client = new Client(
      { name: "plico", version: "1" },
      {
        versionNegotiation: { mode: "auto" },
      },
    );
    const environment = (variable: string): string => {
      const value = process.env[variable];
      if (value === undefined)
        throw new Error(`MCP server ${serverId}: missing environment variable ${variable}.`);
      return value;
    };
    const transport =
      source.transport === "stdio"
        ? new StdioClientTransport({
            command: source.command,
            args: source.args ?? [],
            cwd: project.root,
            stderr: "ignore",
            env: Object.fromEntries((source.env ?? []).map((name) => [name, environment(name)])),
          })
        : new StreamableHTTPClientTransport(new URL(source.url), {
            requestInit: {
              redirect: "error",
              headers: Object.fromEntries(
                Object.entries(source.headersEnv ?? {}).map(([name, variable]) => [
                  name,
                  environment(variable),
                ]),
              ),
            },
            fetch: (input, init) => {
              const deadline =
                init?.method === "DELETE" ? AbortSignal.timeout(Math.min(timeoutMs, 1000)) : signal;
              return fetch(input, {
                ...init,
                signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
              });
            },
          });
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline.signal])
      : deadline.signal;
    let failure: unknown;
    try {
      let advertised: Awaited<ReturnType<typeof client.listTools>>;
      try {
        await client.connect(transport, { signal, timeout: timeoutMs });
        advertised = await client.listTools(undefined, { signal, timeout: timeoutMs });
      } catch {
        throw new Error(
          `MCP server ${serverId}: discovery ${options.signal?.aborted ? "cancelled" : deadline.signal.aborted ? "timed out" : "connection or tool listing failed"}.`,
        );
      }
      for (const name of source.tools) {
        const matches = advertised.tools.filter((tool) => tool.name === name);
        if (matches.length > 1)
          throw new Error(`MCP server ${serverId}: ${name} is advertised more than once.`);
        const tool = matches[0];
        if (!tool) throw new Error(`MCP server ${serverId}: ${name} is not advertised.`);
        const normalizedName = `mcp_${serverId}__${tool.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
        if (tools.some((tool) => tool.name === normalizedName))
          throw new Error(
            `Duplicate MCP tool name ${normalizedName}. Rename the source or narrow its allowlist.`,
          );
        tools.push({
          serverId,
          toolName: tool.name,
          source: `mcp:${serverId}/${tool.name}`,
          name: normalizedName,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema as JsonSchema,
          capabilities: [],
          approval: { required: true },
        });
      }
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
      try {
        if (transport instanceof StreamableHTTPClientTransport) await transport.terminateSession();
      } catch {
        failure ??= new Error(`MCP server ${serverId}: session cleanup failed.`);
      }
      try {
        await client.close();
      } catch {
        failure ??= new Error(`MCP server ${serverId}: client cleanup failed.`);
      }
    }
    if (failure !== undefined) throw failure;
  }
  return tools;
}
