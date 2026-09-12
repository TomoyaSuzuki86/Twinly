import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = process.env.GITHUB_SHA ?? process.env.VITE_BUILD_ID ?? "local";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "twinly-build-diagnostics",
      transformIndexHtml() {
        return [{
          tag: "script",
          children: `try{localStorage.setItem("twinly-build-id",${JSON.stringify(JSON.stringify({ buildId }))})}catch{}`,
          injectTo: "head",
        }];
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "*.test.ts"],
  },
});
