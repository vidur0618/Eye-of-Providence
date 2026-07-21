import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "development-csp",
      transformIndexHtml(html) {
        if (command !== "serve") {
          return html;
        }

        // Vite injects component CSS through inline style elements while serving.
        // The production build remains on the strict, same-origin-only policy.
        return html.replace(
          "style-src 'self';",
          "style-src 'self' 'unsafe-inline';",
        );
      },
    },
  ],
  base: "./",
  test: {
    environment: "jsdom",
  },
}));
