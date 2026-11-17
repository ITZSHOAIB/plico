/** A `provider:model` reference, such as `openai:gpt-5-mini`, split at its first colon. */
export function parseModelRef(ref: unknown): { provider: string; name: string } | undefined {
  if (typeof ref !== "string" || !/^[^:\s]+:\S+$/.test(ref)) return undefined;
  const colon = ref.indexOf(":");
  return { provider: ref.slice(0, colon), name: ref.slice(colon + 1) };
}
