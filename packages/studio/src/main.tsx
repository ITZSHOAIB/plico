import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { App } from "./App";
import "./index.css";
import { initTheme } from "./theme/theme";

initTheme();

const root = document.getElementById("root");
if (root && import.meta.env.DEV && new URLSearchParams(location.search).has("chatFixtures")) {
  void import("./dev/ChatFixtures").then(({ ChatFixtures }) => {
    createRoot(root).render(
      <StrictMode>
        <ChatFixtures />
      </StrictMode>,
    );
  });
} else if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
