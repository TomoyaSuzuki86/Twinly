import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AiAdviceLauncher } from "./components/AiAdviceLauncher";
import { FamilyAccountIconEnhancer } from "./components/FamilyAccountIconEnhancer";
import { PrimaryActionMorphEnhancer } from "./components/PrimaryActionMorphEnhancer";
import { installGlobalInputGuards } from "./lib/global-input-guards";
import { installServiceWorkerRegistration } from "./lib/service-worker-registration";
import "./index.css";
import "./theme-polish.css";
import "./sync-status.css";

const uninstallInputGuards = installGlobalInputGuards();
const uninstallServiceWorkerRegistration = installServiceWorkerRegistration();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AiAdviceLauncher />
    <FamilyAccountIconEnhancer />
    <PrimaryActionMorphEnhancer />
  </React.StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    uninstallInputGuards();
    uninstallServiceWorkerRegistration();
  });
}
