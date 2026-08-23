import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.PLOY_PUBLIC_BASE ?? "/",
  plugins: [react()],
  worker: {
    format: "es",
  },
});
