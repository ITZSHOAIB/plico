import { createServer, type IncomingHttpHeaders } from "node:http";

interface Request {
  method: string;
  params?: {
    cursor?: string;
    clientInfo?: { version: string };
    name?: string;
    arguments?: unknown;
  };
  id?: number;
}

interface McpHttpFixture {
  url: string;
  requests: Array<{ method: string; headers: IncomingHttpHeaders; params?: Request["params"] }>;
  close(): Promise<void>;
}

/** Local protocol fixture, independent of Plico's client implementation. */
export async function mcpHttp(
  pages: unknown[][],
  delayListMs = 0,
  fault?: {
    deleteError?: string;
    deleteAfterCallError?: string;
    hangDelete?: boolean;
    redirect?: boolean;
    modern?: boolean;
    httpStatus?: number;
    errorBody?: string;
    mcpError?: { code: number; message: string };
    callResult?: unknown;
    hangCall?: boolean;
    callError?: { code: number; message: string };
  },
): Promise<McpHttpFixture> {
  const requests: McpHttpFixture["requests"] = [];
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") {
      requests.push({ method: "DELETE", headers: req.headers });
      if (fault?.hangDelete) return;
      const deleteError =
        fault?.deleteError ??
        (requests.some((request) => request.method === "tools/call")
          ? fault?.deleteAfterCallError
          : undefined);
      if (deleteError) {
        res.writeHead(500).end(deleteError);
        return;
      }
      res.writeHead(200).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    if (fault?.httpStatus) {
      res.writeHead(fault.httpStatus).end(fault.errorBody);
      return;
    }
    if (fault?.redirect && req.url === "/mcp") {
      res.writeHead(307, { Location: "/forward" }).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString()) as Request;
    requests.push({ method: request.method, headers: req.headers, params: request.params });
    if (request.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    let result: unknown;
    if (request.method === "server/discover" && fault?.modern) {
      result = { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } };
    } else if (request.method === "initialize") {
      res.setHeader("Mcp-Session-Id", "fixture-session");
      result = {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "local-http", version: "1" },
      };
    } else if (request.method === "tools/call") {
      if (fault?.hangCall) return;
      result = fault?.callResult ?? { content: [{ type: "text", text: "Ticket 42" }] };
    } else if (request.method === "tools/list") {
      if (delayListMs) await new Promise((resolve) => setTimeout(resolve, delayListMs));
      const page = Number(request.params?.cursor ?? 0);
      result = {
        tools: pages[page] ?? [],
        ...(fault?.modern ? { resultType: "complete", ttlMs: 0, cacheScope: "private" } : {}),
        ...(page + 1 < pages.length ? { nextCursor: String(page + 1) } : {}),
      };
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        ...(request.method === "tools/call" && fault?.callError
          ? { error: fault.callError }
          : request.method === "tools/list" && fault?.mcpError
            ? { error: fault.mcpError }
            : result
              ? { result }
              : { error: { code: -32601, message: "Unknown method" } }),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture address");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
