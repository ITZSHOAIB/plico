/**
 * Hides Node's one-line "SQLite is an experimental feature" notice from the `plico` command, so
 * the commands that open the run database do not print it. Every other warning still prints.
 * Only the bin calls this: a host app that mounts Plico owns its own process warnings.
 */
export function quietSqliteWarning(): void {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const type = typeof rest[0] === "string" ? rest[0] : (warning as Error).name;
    if (type === "ExperimentalWarning" && /^SQLite is an experimental feature/.test(message))
      return;
    (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}
