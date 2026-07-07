import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://plico.sohab.dev",
  integrations: [mdx()],
  trailingSlash: "always",
});
