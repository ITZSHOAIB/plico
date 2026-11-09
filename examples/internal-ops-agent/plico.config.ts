import { defineConfig } from "@plico-ai/sdk";

export default defineConfig({
  schemaVersion: 1,
  name: "Internal Ops Agent",
  template: "internal-ops",
  model: {
    provider: "anthropic",
    name: "claude-sonnet-5-5",
  },
});
