import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@plico-ai/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@plico-ai/cli": resolve(rootDir, "packages/cli/src/index.ts"),
      "@plico-ai/runtime": resolve(rootDir, "packages/runtime/src/index.ts"),
      "@plico-ai/server": resolve(rootDir, "packages/server/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "examples/**/*.test.ts"],
    environment: "node",
  },
});
