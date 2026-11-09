# create-plico

Scaffold generator for the internal-ops starter project.

## Usage

- `pnpm --filter create-plico exec create-plico my-plico`
- `pnpm --filter create-plico exec create-plico`
- `create-plico --help` prints usage and `create-plico --version` prints the version. Any other argument that starts with `-` is rejected, so a typo never becomes a directory name.

`create-plico my-plico --provider anthropic|openai|google|openai-compatible` configures a model and writes the matching `.env.example` and adapter dependency. The interactive flow asks for the provider; without `--provider`, a non-interactive run configures none. The scaffold also writes a `package.json` with `dev`, `validate` and `eval` scripts, `@plico/cli` as a dev dependency, and a `.gitignore` for `.plico/` and `.env`.

The generated scaffold includes the required Plico project files and directories so it is immediately valid and can complete `plico run --dry` without extra setup.
