/** HTTP statuses come from the fetch response; error objects contribute only known codes. */
export function safeReason(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = "code" in error ? error.code : undefined;
  if (
    typeof code === "string" &&
    [
      "ENOENT",
      "EACCES",
      "EPERM",
      "ENOTDIR",
      "ENOEXEC",
      "EAGAIN",
      "ENOMEM",
      "EMFILE",
      "ENFILE",
      "E2BIG",
      "EINVAL",
    ].includes(code)
  )
    return code;
  return typeof code === "number" && Number.isSafeInteger(code) ? `MCP code ${code}` : undefined;
}
