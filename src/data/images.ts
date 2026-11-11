/**
 * Photographs in src/assets/images, looked up by file name without the extension.
 *
 * The current set is AI-generated illustrative imagery. Replace a file with a real
 * photograph of the same name (landscape, at least 1600px wide) and every place that
 * uses it updates on the next build.
 */

import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/images/*.{jpg,jpeg,png,webp,avif}', { eager: true });

const byName = new Map(
  Object.entries(files).map(([path, module]) => {
    const name = path.split('/').pop()!.replace(/\.\w+$/, '');

    return [name, module.default];
  }),
);

export function image(name: string): ImageMetadata {
  const found = byName.get(name);

  if (!found) throw new Error(`No image named "${name}" in src/assets/images.`);

  return found;
}
