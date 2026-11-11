/**
 * The four stages of the 3D build story (src/components/BuildStory.astro).
 *
 * This is the single source of stage timing: the captions and the 3D scene
 * (src/scripts/build-scene.ts) both read `start` from here.
 *
 * `group` is the id of the service group (src/data/services.ts) each stage links to.
 */

export const buildStages = [
  {
    start: 0,
    icon: 'crane-tower',
    title: 'Structure',
    group: 'construction',
    text: 'Foundations, frame and core rise floor by floor.',
    services: ['Civil Construction', 'Building Contracting', 'Design & Build'],
  },
  {
    start: 0.28,
    icon: 'pipe',
    title: 'Systems and fit-out',
    group: 'maintenance',
    text: 'Mechanical, electrical and plumbing go in, then the interiors.',
    services: ['MEP', 'Fit-out', 'Modification'],
  },
  {
    start: 0.52,
    icon: 'paint-roller',
    title: 'Envelope and finishes',
    group: 'finishes',
    text: 'The building closes up and specialist crews finish its surfaces.',
    services: ['Special Finishes', 'Micro-cement', 'Polished Concrete'],
  },
  {
    start: 0.78,
    icon: 'crown',
    title: 'Gold leaf',
    group: 'artistic',
    text: 'Gilding, carved plaster and artwork complete the building.',
    services: ['Gilding', 'Carved Plaster', 'Mural Painting'],
  },
];

/** Where each stage begins, as a share of the build (0 to 1). */
export const STAGE_STARTS = buildStages.map((stage) => stage.start);

/**
 * The build completes at this share of the scroll through the section.
 * The remainder holds the finished building on screen before the pin releases.
 */
export const BUILD_END = 0.94;
