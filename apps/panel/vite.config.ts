import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mapConfig } from "./src/mapConfig";
export default defineConfig(({ mode, command }) => {
  mapConfig({
    ...loadEnv(mode, process.cwd(), "VITE_"),
    DEV: command === "serve",
  });
  return {
    plugins: [react()],
    server: {
      strictPort: true,
      port: 5173,
      proxy: {
        "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
      },
    },
    build: { sourcemap: false },
  };
});
