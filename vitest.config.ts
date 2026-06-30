import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@plico/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@plico/cli": resolve(rootDir, "packages/cli/src/index.ts"),
      "@plico/runtime": resolve(rootDir, "packages/runtime/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts"],
    environment: "node",
  },
});
