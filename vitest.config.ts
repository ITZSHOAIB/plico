import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@plico/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@plico/cli": resolve(rootDir, "packages/cli/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts"],
    environment: "node",
  },
});
