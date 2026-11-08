import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { thirdPartyNoticesPlugin } from "./build/third-party-notices";

const apiTarget = process.env.PLICO_API_URL ?? "http://127.0.0.1:3000";
const allowedHosts = process.env.PLICO_ALLOWED_HOSTS?.split(",").filter(Boolean);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    thirdPartyNoticesPlugin(
      fileURLToPath(new URL("./build/copied-source-notices.txt", import.meta.url)),
      ["tailwindcss"],
    ),
  ],
  build: {
    outDir: "dist",
  },
  server: {
    ...(allowedHosts ? { allowedHosts } : {}),
    proxy: {
      "/v1": apiTarget,
    },
  },
});
