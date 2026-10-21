// Build config used only for the Electron desktop package (not the web deploy).
// Produces a static client build (dist/index.html) with relative asset paths,
// which is what Electron loads via file://.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    base: "./",
  },
  tanstackStart: {
    prerender: {
      enabled: true,
      pages: ["/"],
    },
  },
});
