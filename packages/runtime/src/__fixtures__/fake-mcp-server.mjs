import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "echo",
    description: "Echoes the input back.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "add",
    description: "Adds two numbers.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  },
];

const rl = createInterface({ input: process.stdin });

function sendResponse(id, result) {
  const response = { jsonrpc: "2.0", id, result };
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function sendError(id, code, message) {
  const response = { jsonrpc: "2.0", id, error: { code, message } };
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

rl.on("line", (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = request;

  if (method === "initialize") {
    sendResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "fake-mcp-server", version: "1.0.0" },
    });
  } else if (method === "notifications/initialized") {
    // No response needed for notifications
  } else if (method === "tools/list") {
    sendResponse(id, { tools: TOOLS });
  } else if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};

    if (toolName === "echo") {
      sendResponse(id, {
        content: [{ type: "text", text: args.message ?? "" }],
      });
    } else if (toolName === "add") {
      const sum = (args.a ?? 0) + (args.b ?? 0);
      sendResponse(id, {
        content: [{ type: "text", text: String(sum) }],
      });
    } else {
      sendError(id, -32601, `Unknown tool: ${toolName}`);
    }
  } else {
    sendError(id, -32601, `Method not found: ${method}`);
  }
});
