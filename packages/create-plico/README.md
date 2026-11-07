# create-plico

Scaffold generator for the internal-ops starter project.

## Usage

- `pnpm --filter create-plico exec create-plico my-plico`
- `pnpm --filter create-plico exec create-plico`
- `create-plico --help` prints usage and `create-plico --version` prints the version. Any other argument that starts with `-` is rejected, so a typo never becomes a directory name.

The generated scaffold includes the required Plico project files and directories so it is immediately valid and can complete `plico run --dry` without extra setup.
