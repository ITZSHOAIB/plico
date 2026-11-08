# Skills are folders

Status: accepted (2026-11-09), implemented by epic #99. Research: `product/audits/0016-library-first-embedding.md` (`agent.md` frontmatter rule).

A skill is a folder `skills/<name>/SKILL.md`, the layout of the Agent Skills standard. Flat `skills/<name>.md` files are not supported.

## Decision

- The skill name is the folder name. `SKILL.md` carries a `description` in its frontmatter.
- `plico validate` rejects a flat `skills/<name>.md` file with a message naming where to move it, a skill folder with no `SKILL.md`, and a skill with no description.
- The change is breaking, and it is made before the first publish, when no project depends on the old layout. The owner chose one layout over supporting two.
- Files beside `SKILL.md` are allowed and ignored. Plico runs no skill scripts until a sandbox policy exists.

## `agent.md` frontmatter

- `agent.md` may start with a frontmatter block, read by the same parser as skills.
- The block is parsed and stripped. The model never sees it, and `instructions.composed` records only the instructions.
- `plico validate` warns on each key it does not know. No key is known yet; later features add keys without changing existing projects.
- A file that is only frontmatter counts as empty.
