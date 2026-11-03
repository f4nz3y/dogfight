import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      },
      "^/ws$": {
        target: "ws://127.0.0.1:3001",
        ws: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        wsTest: fileURLToPath(new URL("./ws-test.html", import.meta.url))
      }
    }
  }
});
