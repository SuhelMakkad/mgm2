import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const team = defineCollection({
  loader: glob({ base: './src/content/team', pattern: '**/*.md' }),

  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      order: z.number(),

      // Short line shown under the name on cards and at the top of the profile.
      tagline: z.string().optional(),

      // One or two sentences for cards and the meta description.
      summary: z.string(),

      // Closing statement, set apart at the end of the profile.
      closing: z.string().optional(),

      // Portrait, relative to the markdown file (e.g. ../../assets/team/john-kurien.jpg).
      photo: image().optional(),
    }),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),

  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      order: z.number().default(100),

      // Must match an id in src/data/sectors.ts.
      sector: z.string(),
      status: z.enum(['ongoing', 'completed', 'upcoming']),

      location: z.string(),
      year: z.string().optional(),
      client: z.string().optional(),
      scope: z.array(z.string()).default([]),

      // Photograph, relative to the markdown file (e.g. ../../assets/projects/villa.jpg).
      image: image().optional(),
      imageAlt: z.string().optional(),

      featured: z.boolean().default(false),

      // Marks placeholder entries. They show a "Sample" tag until replaced with real projects.
      sample: z.boolean().default(false),
    }),
});

export const collections = { team, projects };
