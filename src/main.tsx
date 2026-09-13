import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AiAdviceLauncher } from "./components/AiAdviceLauncher";
import { FamilyAccountIconEnhancer } from "./components/FamilyAccountIconEnhancer";
import { PrimaryActionMorphEnhancer } from "./components/PrimaryActionMorphEnhancer";
import { installGlobalInputGuards } from "./lib/global-input-guards";
import "./index.css";
import "./theme-polish.css";
import "./sync-status.css";

const uninstallInputGuards = installGlobalInputGuards();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AiAdviceLauncher />
    <FamilyAccountIconEnhancer />
    <PrimaryActionMorphEnhancer />
  </React.StrictMode>
);

if (import.meta.hot) import.meta.hot.dispose(uninstallInputGuards);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      });
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });

      const checkForUpdate = () => {
        registration.update().catch((error) => {
          console.warn("Service worker update check failed", error);
        });
      };

      checkForUpdate();
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
}
