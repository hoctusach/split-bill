import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE ?? "/split-bill/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Split Bill",
        short_name: "Split Bill",
        description: "Split trip expenses on your device. No account.",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f7f4ee",
        theme_color: "#0c5f56",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,webmanifest}"],
      },
    }),
    {
      name: "github-pages-spa-fallback",
      apply: "build",
      writeBundle() {
        const dist = resolve("dist");
        copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
      },
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
