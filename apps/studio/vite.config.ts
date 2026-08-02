/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The Convex API is aliased to the Study checkout next door, exactly as Crew
// does it. That means builds happen locally, where Study exists, and ship with
// `vercel deploy --prebuilt` — Vercel only ever checks out one repo, so a
// build on their side could not resolve these paths.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@convex/api": path.resolve(__dirname, "../../../Study/convex/_generated/api"),
      "@convex/dataModel": path.resolve(
        __dirname,
        "../../../Study/convex/_generated/dataModel",
      ),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
