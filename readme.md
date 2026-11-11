# Al Madar MGM Construction LLC website

Multi-page marketing site built with [Astro](https://astro.build). It ships as static HTML with one small script, a single self-hosted variable font, build-optimised photographs and inline SVG icons, so there is no client framework to load.

## Commands

| Command | Action |
| :-- | :-- |
| `bun install` | Install dependencies |
| `bun dev` | Start the dev server |
| `bun run build` | Build the production site to `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run images` | Generate any missing photographs with the Codex CLI |
| `bun run assets` | Regenerate the favicon and app icons in `public/` |
| `bun run model` | Rebuild the 3D model for the build story with Blender |

## Pages

| Route | Source |
| :-- | :-- |
| `/` | `src/pages/index.astro` |
| `/about/` | `src/pages/about/index.astro` (mission and vision, MD's message, history teaser, team, group companies) |
| `/about/history/` | `src/pages/about/history.astro` |
| `/about/team/` and `/about/team/<id>/` | `src/pages/about/team/` |
| `/services/` | `src/pages/services.astro` |
| `/sectors/` | `src/pages/sectors.astro` |
| `/projects/` and `/projects/<id>/` | `src/pages/projects/` |
| `/certifications/` | `src/pages/certifications.astro` |
| `/contact/` | `src/pages/contact.astro` (enquiry form, subcontractor and supplier registration, careers, locations) |

## Where the content lives

| Content | File |
| :-- | :-- |
| Company name, tagline, contact details, navigation, group companies | `src/data/site.ts` |
| Services, their icons and descriptions | `src/data/services.ts` |
| Sectors, their icons, pictures and descriptions | `src/data/sectors.ts` |
| History timeline | `src/data/history.ts` |
| Certifications | `src/data/certifications.ts` |
| Team profiles (one Markdown file each) | `src/content/team/` |
| Projects (one Markdown file each) | `src/content/projects/` |

To add a project, copy any file in `src/content/projects/`, change the frontmatter and text, and remove `sample: true`. The filters, list view, sector links and home page pick it up automatically.

## Design system

- **Colour:** graphite and warm white with one safety-orange accent. The tokens are at the top of `src/styles/global.css`; components use the semantic variables (`--bg`, `--fg`, `--accent`, `--accent-text`), so changing a token recolours the whole site.
- **Type:** Archivo, one variable font file in `src/assets/fonts/`, trimmed to weights 400 to 800 and widths 100% to 125%. Headings use the wide, heavy end; body copy uses the regular width.
- **Icons:** [Phosphor](https://phosphoricons.com), inlined at build time through `src/components/icon.astro`. Use any icon by name, for example `<Icon name="crane-tower" />`.
- **Motion:** load-in and scroll reveals, the service panels, the sector rail and page crossfades. All of it is disabled for visitors who prefer reduced motion.

## 3D build story

The Services page opens with a scroll-driven 3D section: a building assembles in four stages as the page scrolls (structure, systems and fit-out, envelope, then the gilded finish). Each stage links to the service group it draws on.

- **Use it elsewhere:** add `<BuildStory />` from `src/components/build-story.astro`, with a `title` to suit the page. Give each instance its own `id` if a page has more than one.
- **Stage copy, timing and links:** `src/data/build-stages.ts` is the single source for the captions, the scene's timing and the service group each stage links to.
- **The scene:** `src/scripts/build-scene.ts` draws it with [three.js](https://threejs.org). The concrete frame, the services and the crane are simple shapes made in code. The envelope and the finish (curtain wall, stonework, arcade, dome and gilding) are an authored model, played by `src/scripts/build-model.ts`. Nothing moves on its own: a frame is drawn only when the scroll position, pointer or size changes.
- **Cost:** the scene's code is about 165 KB gzipped and the model about 63 KB (207 KB on disk). Both are fetched side by side, only when the section is within two thirds of a screen and the page has finished loading. Pages without the section never load them.
- **When it stays still:** with reduced motion, a data-saver connection, no WebGL2 or WebAssembly, no script, or a window too short for the pinned layout, the section is an ordinary block with a still picture (`src/assets/images/build-poster.jpg`) beside the four stages. It also returns to that version if the scene fails to start, and visitors can choose it with "Show all stages as a list".
- **Accessibility:** stage titles are buttons that jump to their stage, a skip link leads past the section, and every stage stays readable to assistive technology.
- **Colour:** the crane, services and canopy use the site's accent colour, read from the stylesheet.

### The model

`src/assets/models/build-envelope.glb` is authored in [Blender](https://www.blender.org) by a script, `scripts/build-model.py`, so every part is exact and the file can be rebuilt at any time. It is committed, so building the site does not need Blender.

- **Rebuild it:** `bun run model`. This runs Blender in the background (version 5; made with 5.2, on the `PATH`, in `/Applications` on a Mac, or named by the `BLENDER` environment variable), then `scripts/generate-build-model.mjs` turns repeated parts into GPU instances and compresses the file with Meshopt. Add `--blend scene.blend` to also save the scene and open it in Blender.
- **Change it:** edit `scripts/build-model.py`. Each object carries custom properties that the scene plays back: `stage` (`envelope` or `finish`), `motion` (`grow-x`, `grow-y`, `drop`, `fly` or `reveal`), and `at` and `span`, which time it within its stage. Objects that share a mesh become one draw call. Gold leaf reuses the geometry of the plaster it covers, so it adds no vertex or index data to the file.
- **Shared dimensions:** the model and the procedural frame are both built to `src/data/build-dimensions.json`, so the facade closes around the structure. Change a dimension there, then rebuild the model.
- **After a change:** re-capture the still, `src/assets/images/build-poster.jpg`, from the finished scene so the fallback matches.

## Photographs

All pictures live in `src/assets/images/` and are looked up by file name through `image('<name>')` in `src/data/images.ts`. Astro resizes each one and serves AVIF with a WebP fallback.

The current set is **AI-generated illustrative imagery**, made with `scripts/generate-images.mjs` from the prompts in `scripts/image-prompts.json`. It is there to show the design at full strength, not to document real work.

- **Replace with real photography:** drop a file with the same name into `src/assets/images/` (landscape, at least 1600px wide). Project, timeline and team pictures should be real before launch.
- **Generate more:** add a scene to `scripts/image-prompts.json`, run `bun run images`, then use it with `image('<name>')`. Name a scene to regenerate it, for example `bun run images hero-home`. The script drives `codex app-server` as described in `docs/codex-cli.md` and needs Codex signed in.
- **Team portraits:** these are monograms on purpose. Portraits of real, named people should be photographs, not generated. Put the file in `src/assets/team/` and add `photo: ../../assets/team/<file>.jpg` to the member's frontmatter.
- **Project photos:** set `image: ../../assets/images/<file>.jpg` and `imageAlt` in the project's frontmatter. Without one, a project shows the picture of its sector.

## GitHub Pages

The site is deployed at [suhelmakkad.github.io/mgm2](https://suhelmakkad.github.io/mgm2/) from the public [SuhelMakkad/mgm2](https://github.com/SuhelMakkad/mgm2) repository. Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site with Bun and deploys `dist/` to GitHub Pages.

`astro.config.mjs` defaults to `site: 'https://suhelmakkad.github.io'` and `base: '/mgm2'`. Internal links use `withBase()` from `src/lib/paths.ts` so navigation, public assets and structured data work under that subdirectory. For a custom domain at the root, set `SITE_URL` to the domain and `BASE_PATH=/` when building, and configure that domain in GitHub Pages.

## Before launch

These were not part of the brief and are placeholders. Search the code for `TODO` to find each one.

- **Custom domain:** if needed, override `SITE_URL` and `BASE_PATH` as described above. They drive canonical URLs, Open Graph tags, `robots.txt` and the sitemap.
- **Contact details:** email, careers email, phone, office hours, address and map link in `src/data/site.ts`.
- **Contact form:** set `PUBLIC_FORM_ENDPOINT` to a form backend that accepts a `POST`. Until it is set, the form opens a pre-filled email instead of submitting in place. Sending the registration link to subcontractors and suppliers happens in that backend or by hand.
- **Projects:** the eight entries in `src/content/projects/` are samples with illustrative pictures. They carry a visible "Sample" tag, are marked `noindex` and are left out of the sitemap.
- **Photographs:** replace the generated imagery, starting with projects, the history timeline and the team.
- **Certifications:** add the specific standards, certificate numbers, validity dates and scans in `src/data/certifications.ts`.
- **History:** add years for the undated milestones in `src/data/history.ts`.
- **Group companies:** add descriptions and links in `src/data/site.ts`.
- **Logo:** `src/components/brand.astro` and `public/favicon.svg` hold a stand-in mark. Replace them with the official artwork, then run `bun run assets`.
- **Social card:** `public/og.jpg` is a 1200x630 capture of the home page hero. Re-capture it if the hero or the colours change.
- **Copy review:** the service and sector descriptions were drafted for the site and need client approval.
