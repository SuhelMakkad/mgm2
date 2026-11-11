# Al Madar MGM Construction LLC website

Multi-page marketing site built with [Astro](https://astro.build). It ships as static HTML with one small script, self-hosted variable fonts and inline SVG artwork, so there is no client framework to load.

## Commands

| Command | Action |
| :-- | :-- |
| `bun install` | Install dependencies |
| `bun dev` | Start the dev server |
| `bun run build` | Build the production site to `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run assets` | Regenerate the favicon, app icons and social card in `public/` |

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
| Services and their descriptions | `src/data/services.ts` |
| Sectors, their descriptions and line drawings | `src/data/sectors.ts` |
| History timeline | `src/data/history.ts` |
| Certifications | `src/data/certifications.ts` |
| Team profiles (one Markdown file each) | `src/content/team/` |
| Projects (one Markdown file each) | `src/content/projects/` |

To add a project, copy any file in `src/content/projects/`, change the frontmatter and text, and remove `sample: true`. The filters, list view, sector links and home page pick it up automatically.

## Adding photographs

Every picture slot shows a line drawing until a photograph is supplied, so nothing on the site is stock imagery. Photographs are optimised at build time (resized, converted and lazy-loaded).

- **Team portraits:** put the file in `src/assets/team/` and add `photo: ../../assets/team/<file>.jpg` to the member's frontmatter.
- **Project photos:** put the file in `src/assets/projects/` and add `image: ../../assets/projects/<file>.jpg` and `imageAlt` to the project's frontmatter.
- **Timeline pictures:** import the file in `src/data/history.ts` and set `image` and `imageAlt` on the milestone.

## Before launch

These were not part of the brief and are placeholders. Search the code for `TODO` to find each one.

- **Domain:** set `SITE_URL` (or the fallback in `astro.config.mjs`). It drives canonical URLs, Open Graph tags, `robots.txt` and the sitemap.
- **Contact details:** email, careers email, phone, office hours, address and map link in `src/data/site.ts`.
- **Contact form:** set `PUBLIC_FORM_ENDPOINT` to a form backend that accepts a `POST`. Until it is set, the form opens a pre-filled email instead of submitting in place. Sending the registration link to subcontractors and suppliers happens in that backend or by hand.
- **Projects:** the eight entries in `src/content/projects/` are samples. They carry a visible "Sample" tag, are marked `noindex` and are left out of the sitemap.
- **Certifications:** add the specific standards, certificate numbers, validity dates and scans in `src/data/certifications.ts`.
- **History:** add years for the undated milestones in `src/data/history.ts`.
- **Group companies:** add descriptions and links in `src/data/site.ts`.
- **Logo:** `src/components/Brand.astro` and `public/favicon.svg` hold a stand-in mark. Replace them with the official artwork, then run `bun run assets`.
- **Copy review:** the service and sector descriptions were drafted for the site and need client approval.
