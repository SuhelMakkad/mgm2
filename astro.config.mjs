// @ts-check
import { readdirSync, readFileSync } from 'node:fs';

import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: set SITE_URL (or replace the fallback) with the production domain before launch.
// It drives canonical URLs, Open Graph tags, robots.txt and the sitemap.
const SITE_URL = process.env.SITE_URL ?? 'https://www.example.com';

// Sample projects are marked noindex on the page, so keep them out of the sitemap too.
const projectsDir = new URL('./src/content/projects/', import.meta.url);

const samplePaths = readdirSync(projectsDir)
  .filter((file) => file.endsWith('.md'))
  .filter((file) => /^sample:\s*true\s*$/m.test(readFileSync(new URL(file, projectsDir), 'utf8')))
  .map((file) => `/projects/${file.replace(/\.md$/, '')}/`);

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
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
      name: 'Besley',
      cssVariable: '--font-besley',
      provider: fontProviders.fontsource(),
      weights: ['400 900'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      name: 'Libre Franklin',
      cssVariable: '--font-franklin',
      provider: fontProviders.fontsource(),
      weights: ['100 900'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
  ],

  integrations: [
    sitemap({
      filter: (page) => !samplePaths.some((path) => page.endsWith(path)),
    }),
  ],
});
