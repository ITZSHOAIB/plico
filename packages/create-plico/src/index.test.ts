import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProjectPaths, validateProject } from "@plico-ai/core";
import {
  createConfiguredModelProvider,
  loadProjectEnv,
  runEvals,
  runProject,
} from "@plico-ai/runtime";
import { describe, expect, it } from "vitest";
import { createInternalOpsScaffold } from "./index.js";

describe("createInternalOpsScaffold", () => {
  it("creates a valid internal-ops scaffold", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const projectPaths = getProjectPaths(root);
    const result = await validateProject(root);
    const configText = await readFile(projectPaths.configFile, "utf8");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(configText).toContain('template: "internal-ops"');
    expect(
      await readFile(join(projectPaths.directories.skills, "triage", "SKILL.md"), "utf8"),
    ).toContain("smallest safe next step");
    expect(await readFile(join(projectPaths.directories.tools, "readme.md"), "utf8")).toContain(
      "`ctx` has `signal`, `idempotencyKey`, `artifacts` and",
    );
    expect(
      await readFile(join(projectPaths.directories.evals, "smoke.script.json"), "utf8"),
    ).toContain("Scripted smoke case");
    expect(await readFile(join(projectPaths.directories.memory, "README.md"), "utf8")).toContain(
      "durable project notes",
    );
    expect(await readFile(join(projectPaths.directories.artifacts, "README.md"), "utf8")).toContain(
      "generated outputs",
    );
    expect(await readFile(join(root, "README.md"), "utf8")).toContain(
      "Canonical internal-ops starter project",
    );
  });

  it("refuses to overwrite a non-empty target directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await mkdir(join(root, "existing"), { recursive: true });
    await writeFile(join(root, "existing", "marker.txt"), "keep me", "utf8");

    await expect(createInternalOpsScaffold({ targetDir: join(root, "existing") })).rejects.toThrow(
      "Target directory is not empty",
    );
  });

  it("completes a default dry run for a generated scaffold", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const result = await runProject(root);

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Dry run complete for Internal Ops Agent.");
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "run.completed",
    ]);
  });

  it("writes what the next documented commands need", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root });

    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(pkg.scripts).toEqual({
      dev: "plico serve --studio .",
      validate: "plico validate .",
      eval: "plico eval .",
    });
    expect(pkg.devDependencies).toHaveProperty("@plico-ai/cli");
    expect(pkg.dependencies).toHaveProperty(["@plico-ai/sdk"]);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toEqual(
      expect.stringContaining(".plico/"),
    );
    expect(await readFile(join(root, ".gitignore"), "utf8")).toEqual(
      expect.stringContaining(".env\n"),
    );
    expect(await readFile(join(root, ".env.example"), "utf8")).toContain("# ");
  });

  it.each([
    ["anthropic", "ANTHROPIC_API_KEY", "@ai-sdk/anthropic"],
    ["openai", "OPENAI_API_KEY", "@ai-sdk/openai"],
    ["google", "GOOGLE_GENERATIVE_AI_API_KEY", "@ai-sdk/google"],
  ] as const)("scaffolds a valid project for the %s provider", async (provider, key, adapter) => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root, provider });

    const result = await validateProject(root);
    expect(result.errors).toEqual([]);
    expect(result.project?.config.model?.provider).toBe(provider);
    expect(await readFile(join(root, ".env.example"), "utf8")).toContain(`${key}=`);
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(pkg.dependencies).toHaveProperty(adapter);
  });

  it("scaffolds openai-compatible against a local server with no key", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));

    await createInternalOpsScaffold({ targetDir: root, provider: "openai-compatible" });

    const result = await validateProject(root);
    expect(result.errors).toEqual([]);
    expect(result.project?.config.model).toMatchObject({
      provider: "openai-compatible",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("runs the local provider scaffold with no OPENAI_API_KEY set", async () => {
    const stub = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta: object, finish: string | null, usage?: object) =>
        `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
      response.write(chunk({ role: "assistant", content: "Hello from the stub." }, null));
      response.write(
        chunk({}, "stop", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
      );
      response.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    const { port } = stub.address() as { port: number };
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "plico-create-"));
      await createInternalOpsScaffold({ targetDir: root, provider: "openai-compatible" });
      const config = join(root, "plico.config.ts");
      await writeFile(
        config,
        (await readFile(config, "utf8")).replace("localhost:11434", `127.0.0.1:${port}`),
      );
      await copyFile(join(root, ".env.example"), join(root, ".env"));
      loadProjectEnv(root);

      const project = await validateProject(root);
      const provider = createConfiguredModelProvider(project.project?.config.model as never, root);
      const result = await runProject(root, { message: "hi", provider: provider as never });

      expect(result.output).toBe("Hello from the stub.");
    } finally {
      stub.close();
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});

describe("scaffold eval and dependencies", () => {
  it("passes plico eval out of the box", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await createInternalOpsScaffold({ targetDir: root });

    const report = await runEvals(root);

    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
  });

  it("pins the provider adapter to a range instead of latest", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await createInternalOpsScaffold({ targetDir: root, provider: "anthropic" });

    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

    expect(pkg.dependencies["@ai-sdk/anthropic"]).toBe("^4.0.0");
  });
});

describe("scaffold agent instructions", () => {
  it("writes AGENTS.md for coding agents and a CLAUDE.md that imports it", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await createInternalOpsScaffold({ targetDir: root });

    const agents = await readFile(join(root, "AGENTS.md"), "utf8");

    expect(agents).toContain("https://plico.sohab.dev/llms.txt");
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
  });

  it("documents a tool and an eval that work as written", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-create-"));
    await createInternalOpsScaffold({ targetDir: root });
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    const blocks = [...agents.matchAll(/```(ts|json)\n([\s\S]*?)```/g)];
    const tool = blocks.find((block) => block[1] === "ts")?.[2] ?? "";
    const evalCase = blocks.find((block) => block[1] === "json")?.[2] ?? "";
    await writeFile(
      join(root, "tools", "issue-refund.tool.ts"),
      tool.replace(
        'import { defineTool } from "@plico-ai/sdk";',
        "const defineTool = <T>(t: T) => t;",
      ),
      "utf8",
    );
    await writeFile(join(root, "evals", "refund.script.json"), evalCase, "utf8");

    const validation = await validateProject(root);
    const report = await runEvals(root);

    expect(validation.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(2);
  });
});
