import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@main": resolve(__dirname, "src/main"),
      },
    },
    build: { outDir: "out/main" },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": resolve(__dirname, "src/shared") },
    },
    build: { outDir: "out/preload" },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@renderer": resolve(__dirname, "src/renderer"),
      },
    },
    build: { outDir: "out/renderer" },
    server: { port: 5173 },
  },
});
