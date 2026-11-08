import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSkills, validateProject } from "./index.js";

/** Keys are paths under `skills/`, such as `triage/SKILL.md` or `notes.txt`. */
async function project(skills: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-skills-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Skills Agent" };',
  );
  await writeFile(join(root, "agent.md"), "# Skills Agent\n\nHelp with internal operations.\n");
  for (const [file, text] of Object.entries(skills)) {
    await mkdir(dirname(join(root, "skills", file)), { recursive: true });
    await writeFile(join(root, "skills", file), text);
  }
  return root;
}

describe("skills", () => {
  it("reads each skill's name, description and body without the frontmatter", async () => {
    const root = await project({
      "triage/SKILL.md": "---\ndescription: Sort urgent work first.\n---\n# Triage\n\nSteps.\n",
      "intake/SKILL.md": '---\ndescription: "Capture the request"\n---\nBody',
      "notes.txt": "Not a skill.",
    });

    const { skills, issues } = await readSkills(root);

    expect(issues).toEqual([]);
    expect(skills).toEqual([
      {
        name: "intake",
        description: "Capture the request",
        source: "skills/intake/SKILL.md",
        body: "Body",
      },
      {
        name: "triage",
        description: "Sort urgent work first.",
        source: "skills/triage/SKILL.md",
        body: "# Triage\n\nSteps.\n",
      },
    ]);
  });

  it("reads a folded multi-line description", async () => {
    const root = await project({
      "triage/SKILL.md": "---\ndescription: >\n  Sort urgent work\n  first.\n---\nBody",
    });

    const { skills } = await readSkills(root);

    expect(skills[0]?.description).toBe("Sort urgent work first.");
  });

  it("rejects a skill with no description in plico validate", async () => {
    const root = await project({
      "triage/SKILL.md": "# Triage\n\nSort urgent work.",
      "empty/SKILL.md": "---\ndescription:   \n---\nBody",
      "fine/SKILL.md": "---\ndescription: Works.\n---\nBody",
    });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.errors.map((issue) => issue.path)).toEqual([
      "skills/empty/SKILL.md",
      "skills/triage/SKILL.md",
    ]);
    expect(result.errors[0]?.message).toContain("description");
  });

  it("accepts a project whose skills all have a description", async () => {
    const root = await project({
      "triage/SKILL.md": "---\ndescription: Sort urgent work.\n---\nBody",
    });

    expect((await validateProject(root)).ok).toBe(true);
  });

  it("rejects a flat skill file and tells the author where it goes", async () => {
    const root = await project({
      "triage.md": "---\ndescription: Sort urgent work.\n---\nBody",
    });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe("skills/triage.md");
    expect(result.errors[0]?.message).toContain("skills/triage/SKILL.md");
  });

  it("rejects a skill folder with no SKILL.md", async () => {
    const root = await project({ "triage/notes.md": "Loose notes." });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe("skills/triage");
    expect(result.errors[0]?.message).toContain("SKILL.md");
  });
});
