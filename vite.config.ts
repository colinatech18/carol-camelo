import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // tanstackRouter precisa vir ANTES do plugin do react (ele gera
  // src/routeTree.gen.ts a partir de src/routes/ antes do código ser
  // transformado pelo @vitejs/plugin-react).
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
});