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
- **The scene:** `src/scripts/build-scene.ts` builds everything from simple shapes with [three.js](https://threejs.org), so there is no model file. Nothing moves on its own: a frame is drawn only when the scroll position, pointer or size changes.
- **Cost:** three.js is about 146 KB gzipped and is fetched only when the section is within two thirds of a screen and the page has finished loading. Pages without the section never load it.
- **When it stays still:** with reduced motion, a data-saver connection, no WebGL2, no script, or a window too short for the pinned layout, the section is an ordinary block with a still picture (`src/assets/images/build-poster.jpg`) beside the four stages. It also returns to that version if the scene fails to start, and visitors can choose it with "Show all stages as a list".
- **Accessibility:** stage titles are buttons that jump to their stage, a skip link leads past the section, and every stage stays readable to assistive technology.
- **Colour:** the crane, services and canopy use the site's accent colour, read from the stylesheet.
- **Next step for realism:** the model is procedural and stylised. A Blender-authored glTF for the envelope and finish details, compressed with Meshopt, is the route to a more architectural look.

## Photographs

All pictures live in `src/assets/images/` and are looked up by file name through `image('<name>')` in `src/data/images.ts`. Astro resizes each one and serves AVIF with a WebP fallback.

The current set is **AI-generated illustrative imagery**, made with `scripts/generate-images.mjs` from the prompts in `scripts/image-prompts.json`. It is there to show the design at full strength, not to document real work.

- **Replace with real photography:** drop a file with the same name into `src/assets/images/` (landscape, at least 1600px wide). Project, timeline and team pictures should be real before launch.
- **Generate more:** add a scene to `scripts/image-prompts.json`, run `bun run images`, then use it with `image('<name>')`. Name a scene to regenerate it, for example `bun run images hero-home`. The script drives `codex app-server` as described in `docs/codex-cli.md` and needs Codex signed in.
- **Team portraits:** these are monograms on purpose. Portraits of real, named people should be photographs, not generated. Put the file in `src/assets/team/` and add `photo: ../../assets/team/<file>.jpg` to the member's frontmatter.
- **Project photos:** set `image: ../../assets/images/<file>.jpg` and `imageAlt` in the project's frontmatter. Without one, a project shows the picture of its sector.

## Before launch

These were not part of the brief and are placeholders. Search the code for `TODO` to find each one.

- **Domain:** set `SITE_URL` (or the fallback in `astro.config.mjs`). It drives canonical URLs, Open Graph tags, `robots.txt` and the sitemap.
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
