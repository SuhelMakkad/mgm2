// @ts-check
import { readdirSync, readFileSync } from 'node:fs';

import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Override these when deploying to a custom domain or a different subdirectory.
const SITE_URL = process.env.SITE_URL ?? 'https://suhelmakkad.github.io';
const BASE_PATH = process.env.BASE_PATH ?? '/mgm2';

// Sample projects are marked noindex on the page, so keep them out of the sitemap too.
const projectsDir = new URL('./src/content/projects/', import.meta.url);

const samplePaths = readdirSync(projectsDir)
  .filter((file) => file.endsWith('.md'))
  .filter((file) => /^sample:\s*true\s*$/m.test(readFileSync(new URL(file, projectsDir), 'utf8')))
  .map((file) => `/projects/${file.replace(/\.md$/, '')}/`);

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'always',

  build: {
    // The whole stylesheet is small, so inlining it removes the only render-blocking request.
    inlineStylesheets: 'always',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },

  fonts: [
    {
      // Archivo, trimmed to the weights (400 to 800) and widths (100% to 125%) the design uses.
      name: 'Archivo',
      cssVariable: '--font-archivo',
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/archivo-latin-variable.woff2'],
            weight: '400 800',
            stretch: '100% 125%',
            style: 'normal',
          },
        ],
      },
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
  ],

  integrations: [
    sitemap({
      filter: (page) => !samplePaths.some((path) => page.endsWith(path)),
    }),
  ],
});
