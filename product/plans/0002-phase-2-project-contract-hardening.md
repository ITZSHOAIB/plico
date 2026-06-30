# Phase 2 Plan: Project Contract Hardening

## Summary

Strengthen Plico's file-first project contract before entering runtime work. This phase should make `loadProject` behave like a real TypeScript config loader, improve validation diagnostics, add script-friendly CLI output, and turn the internal-ops scaffold into the canonical valid starter project.

Resolved decisions:

- Keep the phase focused on the project contract, not runtime execution.
- Load `plico.config.ts` as trusted local project code.
- Keep validation at a readiness-lite level.
- Add `plico validate [path] --json`.
- Keep `create-plico` centered on the internal-ops template.

## Implementation Changes

Harden `@plico/core`:

- Replace regex config parsing with trusted local execution of `plico.config.ts` using the existing `tsx` ESM API.
- Keep the public core surface centered on `loadProject(root)` and `validateProject(root)`.
- Improve diagnostics for missing config files, invalid exports, thrown config errors, unsupported `schemaVersion`, empty names, and missing required paths.
- Keep `ValidationIssue` stable while allowing warnings for readiness-lite checks.

Extend validation:

- Required files and directories should still fail hard.
- `agent.md` should be readable and non-empty.
- Generated placeholder content should validate cleanly.
- Emit warnings for weak starter content where useful, but do not claim deployment readiness yet.

Update `@plico/cli`:

- Preserve `plico validate [path]` as the primary command.
- Add `--json` for machine-readable validation output.
- Keep human-readable diagnostics as the default output mode.
- Return a nonzero exit code for invalid projects.

Refine `create-plico` and the example project:

- Keep the internal-ops pilot scaffold as the single canonical template.
- Generate meaningful starter `agent.md`, one Markdown skill, tool documentation placeholder, smoke eval, memory placeholder, artifacts directory, and README.
- Ensure the generated scaffold validates cleanly through `@plico/core`.
- Do not define executable TypeScript tool exports yet.

## Test Plan

- Core tests should cover:
  - loading a real `plico.config.ts` export through `tsx`;
  - rejecting missing default exports, malformed exports, missing required fields, wrong field types, empty names, unsupported schema versions, and thrown config errors;
  - validating readable non-empty `agent.md` and required directories;
  - separating warnings from errors where applicable.
- CLI tests should cover:
  - successful validation exits `0`;
  - failed validation exits nonzero;
  - default human output remains intact;
  - `--json` prints parseable structured output without mixing in human diagnostics.
- Create package tests should cover:
  - generated scaffolds validate cleanly;
  - generated output matches the canonical internal-ops expectations;
  - non-empty target overwrite protection remains intact.
- Example coverage should confirm `examples/internal-ops-agent` validates under the stronger contract.

## Assumptions

- Phase 2 does not add runtime execution, provider calls, Studio, server APIs, persistence, approvals, artifact semantics, or TypeScript tool contracts.
- Config execution is acceptable because Plico is validating trusted local project folders, not untrusted uploads.
- No new template family is introduced in this phase.
- No new dependency should be added unless `tsx` proves insufficient for config loading.
