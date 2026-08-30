import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    {
      name: "protect-canonical-placeholder",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace('href="%BASE_URL%"', 'href="data:text/plain,%BASE_URL%"');
        },
      },
    },
    {
      name: "resolve-canonical-url",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html.replace(/(<link rel="canonical" href=")data:text\/plain,[^"]*(")/, `$1${basePath}$2`);
        },
      },
    },
  ],
});
