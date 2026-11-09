import { toLlmsIndex } from "@/lib/llms-index";
import { docsLlms } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  return new Response(toLlmsIndex(await docsLlms.index()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
