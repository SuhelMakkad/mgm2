/**
 * History timeline. The body copy is the client's own history text, split across milestones.
 *
 * TODO(client): supply the years for the undated milestones and a photograph for each one.
 * Set `year` to show a dated stamp, and `image` (an import from src/assets) to replace the drawing.
 */

import type { ImageMetadata } from 'astro';

export interface Milestone {
  year?: string;
  stamp: string;
  title: string;
  body: string[];
  drawing: string;
  image?: ImageMetadata;
  imageAlt?: string;
}

export const evolution = [
  { label: 'Coating contractor', note: 'Where it began, in 1979' },
  { label: 'Civil maintenance', note: 'A wider remit' },
  { label: 'Full-fledged construction', note: 'Marching forward ever since' },
];

export const milestones: Milestone[] = [
  {
    year: '1979',
    stamp: 'Foundation',
    title: 'A clear vision',
    body: [
      'Established in 1979, our company began its journey with a clear vision: to contribute to the growth of the construction industry through quality, commitment, and integrity.',
    ],
    drawing: 'coating',
  },
  {
    stamp: 'Evolution',
    title: 'From coatings to construction',
    body: [
      'What began as a humble coating contracting company metamorphosed into a civil maintenance company and further grew into a full-fledged construction company from where we have been marching forward ever since.',
    ],
    drawing: 'scaffold',
  },
  {
    stamp: 'Growth',
    title: 'Growing alongside Dubai',
    body: [
      "Over the past 47 years, we have witnessed and been part of Dubai's remarkable transformation into one of the world's most dynamic cities. Through decades of growth, changing industry standards, and evolving construction technologies, we have continued to adapt, strengthen our capabilities, and uphold the values upon which our company was founded.",
    ],
    drawing: 'skyline',
  },
  {
    stamp: 'Reputation',
    title: 'Defined by dedication',
    body: [
      'Our journey has been defined by dedication, perseverance, and an unwavering commitment to delivering quality projects and building lasting relationships. Every project undertaken, every challenge overcome, and every partnership established has contributed to the experience and reputation we proudly carry today.',
    ],
    drawing: 'handshake',
  },
  {
    year: '2026',
    stamp: 'Today',
    title: '47 years of achievement',
    body: [
      'Having grown alongside Dubai through decades of remarkable development, we take immense pride in our evolution and the reputation we have built over the years.',
      'Today, we look back with pride on 47 years of achievement and look forward with confidence to the opportunities ahead.',
    ],
    drawing: 'crane',
  },
  {
    stamp: 'Ahead',
    title: 'The story continues',
    body: [
      'As the construction landscape continues to evolve, we remain focused on embracing innovation, developing our expertise, and delivering solutions that meet the demands of a modern and sustainable built environment.',
    ],
    drawing: 'orbit',
  },
];
