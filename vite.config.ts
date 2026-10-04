import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), pdf: fileURLToPath(new URL("./pdf.html", import.meta.url)) } } },
  plugins: [react()],
  resolve: {
    alias: {
      "markdown-it/lib/common/utils.js": fileURLToPath(new URL("./src/vendor/markdownItUtils.ts", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: { reporter: ["text", "html"] },
    server: { deps: { inline: true } }
  }
});
