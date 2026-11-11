/**
 * The service catalogue, grouped into four disciplines.
 *
 * Service names come from the client brief. The one-line descriptions were drafted
 * for the website and need client approval. TODO(client): review descriptions.
 *
 * `icon` is a Phosphor icon name (see src/components/icon.astro).
 * `image` is a file name in src/assets/images (see src/data/images.ts).
 */

export interface Service {
  name: string;
  icon: string;
  description: string;
}

export interface ServiceGroup {
  id: string;
  short: string;
  icon: string;
  image: string;
  letter: string;
  title: string;
  summary: string;
  services: Service[];
}

export const serviceGroups: ServiceGroup[] = [
  {
    id: 'construction',
    short: 'Construction',
    icon: 'crane-tower',
    image: 'svc-construction',
    letter: 'A',
    title: 'Construction & engineering',
    summary: 'The core of what we do: structures, buildings and the systems that run them, delivered under one roof.',
    services: [
      {
        name: 'Civil Construction',
        icon: 'crane-tower',
        description: 'Earthworks, foundations, concrete structures and site infrastructure that carry everything built above them.',
      },
      {
        name: 'Building Contracting',
        icon: 'buildings',
        description: 'Complete delivery of residential, commercial and institutional buildings, from enabling works to handover.',
      },
      {
        name: 'MEP',
        icon: 'pipe',
        description: 'Mechanical, electrical and plumbing works coordinated with structure and finishes from the first drawing.',
      },
      {
        name: 'Design & Build',
        icon: 'pencil-ruler',
        description: 'A single point of responsibility for design, authority approvals and construction.',
      },
      {
        name: 'Specialized Construction',
        icon: 'cube',
        description: 'Unconventional and technically demanding structures that fall outside standard contracting.',
      },
    ],
  },
  {
    id: 'maintenance',
    short: 'Maintenance',
    icon: 'toolbox',
    image: 'svc-maintenance',
    letter: 'B',
    title: 'Maintenance, modification & fit-out',
    summary: 'Keeping existing assets safe, compliant and current, often while they stay in use.',
    services: [
      {
        name: 'Modification',
        icon: 'hammer',
        description: 'Structural and architectural alterations to existing buildings and facilities.',
      },
      {
        name: 'Refurbishment Works',
        icon: 'wrench',
        description: 'Renewing ageing buildings and interiors to current standards with minimal disruption to occupants.',
      },
      {
        name: 'Civil Maintenance',
        icon: 'toolbox',
        description: 'Planned and reactive maintenance of building fabric, structures and external works.',
      },
      {
        name: 'Annual Maintenance Contracts (AMC)',
        icon: 'calendar-check',
        description: 'Scheduled inspections, upkeep and call-out support under a fixed annual agreement.',
      },
      {
        name: 'Fit-out',
        icon: 'couch',
        description: 'Interior construction, partitions, ceilings, joinery and finishes for commercial, hospitality and residential spaces.',
      },
    ],
  },
  {
    id: 'finishes',
    short: 'Finishes',
    icon: 'paint-roller',
    image: 'svc-finishes',
    letter: 'C',
    title: 'Specialist finishes & flooring',
    summary: 'Where the company began in 1979: coatings and surface systems applied by specialist crews.',
    services: [
      {
        name: 'Special Finishes & Decorative Coatings',
        icon: 'paint-roller',
        description: 'Decorative and protective coating systems, textures and effects for walls and floors.',
      },
      {
        name: 'Micro-cement Finishes',
        icon: 'wall',
        description: 'Thin, seamless cementitious finishes for walls, floors and wet areas.',
      },
      {
        name: 'Stamped Concrete',
        icon: 'squares-four',
        description: 'Patterned and textured concrete paving that takes on the look of stone, brick or timber.',
      },
      {
        name: 'Polished Concrete',
        icon: 'sparkle',
        description: 'Mechanically ground and polished concrete floors that are durable, refined and easy to maintain.',
      },
      {
        name: 'Hygienic Flooring',
        icon: 'shield-check',
        description: 'Seamless, easy-to-clean resin floor systems for healthcare, food and clean environments.',
      },
      {
        name: 'Stone Carpet',
        icon: 'diamond',
        description: 'Natural stone aggregate bound in resin for seamless, slip-resistant decorative floors.',
      },
      {
        name: 'Faux Marble Finish',
        icon: 'waves',
        description: 'Hand-painted marbling that recreates the veining and depth of natural stone.',
      },
      {
        name: 'Metal Coating',
        icon: 'medal',
        description: 'Liquid-metal and metallic-effect coatings for walls, joinery and feature elements.',
      },
      {
        name: 'Gilding',
        icon: 'crown',
        description: 'Gold and silver leaf applied by hand to ceilings, mouldings and ornamental details.',
      },
    ],
  },
  {
    id: 'artistic',
    short: 'Artistic',
    icon: 'paint-brush-broad',
    image: 'svc-artistic',
    letter: 'D',
    title: 'Artistic & themed works',
    summary: 'Projects that call for creative execution as much as technical precision.',
    services: [
      {
        name: 'Themed Plaster',
        icon: 'mountains',
        description: 'Sculpted plaster and rockwork that build immersive themed environments.',
      },
      {
        name: 'Carved Plaster',
        icon: 'pen-nib',
        description: 'Ornament carved directly into plaster: patterns, calligraphy and decorative panels.',
      },
      {
        name: 'Relief Works',
        icon: 'frame-corners',
        description: 'Bas-relief and raised sculptural compositions for feature walls and façades.',
      },
      {
        name: '3-D Art on Walls & Floors',
        icon: 'vector-three',
        description: 'Perspective artwork that turns flat surfaces into three-dimensional illusions.',
      },
      {
        name: 'Mural Painting',
        icon: 'paint-brush-broad',
        description: 'Large-scale hand-painted murals for interiors, exteriors and public spaces.',
      },
      {
        name: 'Canvas Painting',
        icon: 'palette',
        description: 'Commissioned paintings on canvas, produced to suit a space and its story.',
      },
    ],
  },
];

export const serviceCount = serviceGroups.reduce((total, group) => total + group.services.length, 0);
