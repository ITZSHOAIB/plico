import { projectToolNames, validateAgentGraph } from "./agent-graph.js";
import { readAgents } from "./agents.js";
import { validateModelProvider } from "./model-provider.js";
import { validateRunSchemas } from "./run-schemas.js";
import { readSkills } from "./skills.js";
import { readToolFileNames } from "./tool-name-validation.js";
import type { LoadedProject, ValidationIssue } from "./types.js";
import { listWorkflowFiles, validateWorkflows } from "./workflows.js";

/** Agent files, workflow files and the references between them, for `plico validate`. */
export async function validateAgentsAndWorkflows(
  project: LoadedProject,
): Promise<ValidationIssue[]> {
  const { agents, issues } = await readAgents(project.root);
  const workflows = await listWorkflowFiles(project.root);
  const skills = await readSkills(project.root).then(
    (result) => result.skills.map((skill) => skill.name),
    () => [],
  );
  const tools = projectToolNames(project, await readToolFileNames(project.root).catch(() => []));
  for (const agent of agents) {
    if (agent.id !== "main")
      issues.push(...(await validateRunSchemas(agent.source, agent.file, agent as never)));
    if (typeof agent.model?.provider === "string")
      issues.push(
        ...(await validateModelProvider(
          project.root,
          { ...project.config.model, ...agent.model } as never,
          agent.source,
        )),
      );
  }
  issues.push(
    ...validateAgentGraph({
      project,
      agents,
      tools,
      skills,
      workflows: workflows.map((workflow) => workflow.id),
    }),
  );
  issues.push(
    ...(await validateWorkflows(
      workflows,
      agents.map((agent) => agent.id),
    )),
  );
  return issues;
}
