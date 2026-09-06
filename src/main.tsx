import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AiAdviceLauncher } from "./components/AiAdviceLauncher";
import "./index.css";

const preventDefault = (event: Event) => event.preventDefault();
const preventMultiTouchZoom = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};

document.addEventListener("selectstart", preventDefault);
document.addEventListener("dblclick", preventDefault, { passive: false });
document.addEventListener("gesturestart", preventDefault, { passive: false });
document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AiAdviceLauncher />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
