/**
 * Closes Markdown that a streaming reply has opened but not finished yet, so an unfinished
 * code fence renders as code instead of flashing as plain text until the closing fence arrives.
 */
export function closeOpenMarkdown(text: string): string {
  const fences = text.match(/^ {0,3}(`{3,}|~{3,})/gm) ?? [];
  if (fences.length % 2 === 1) return `${text}\n${fences.at(-1)?.trim()}`;
  const paragraph = text.slice(text.lastIndexOf("\n\n") + 1);
  if ((paragraph.match(/`/g) ?? []).length % 2 === 1) return `${text}\``;
  if ((paragraph.match(/\*\*/g) ?? []).length % 2 === 1) return `${text}**`;
  return text;
}
