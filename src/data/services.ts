/**
 * The service catalogue, grouped into four disciplines.
 *
 * Service names come from the client brief. The one-line descriptions were drafted
 * for the website and need client approval. TODO(client): review descriptions.
 */

export interface Service {
  name: string;
  description: string;
}

export interface ServiceGroup {
  id: string;
  letter: string;
  title: string;
  summary: string;
  services: Service[];
}

export const serviceGroups: ServiceGroup[] = [
  {
    id: 'construction',
    letter: 'A',
    title: 'Construction & engineering',
    summary: 'The core of what we do: structures, buildings and the systems that run them, delivered under one roof.',
    services: [
      {
        name: 'Civil Construction',
        description: 'Earthworks, foundations, concrete structures and site infrastructure that carry everything built above them.',
      },
      {
        name: 'Building Contracting',
        description: 'Complete delivery of residential, commercial and institutional buildings, from enabling works to handover.',
      },
      {
        name: 'MEP',
        description: 'Mechanical, electrical and plumbing works coordinated with structure and finishes from the first drawing.',
      },
      {
        name: 'Design & Build',
        description: 'A single point of responsibility for design, authority approvals and construction.',
      },
      {
        name: 'Specialized Construction',
        description: 'Unconventional and technically demanding structures that fall outside standard contracting.',
      },
    ],
  },
  {
    id: 'maintenance',
    letter: 'B',
    title: 'Maintenance, modification & fit-out',
    summary: 'Keeping existing assets safe, compliant and current, often while they stay in use.',
    services: [
      {
        name: 'Modification',
        description: 'Structural and architectural alterations to existing buildings and facilities.',
      },
      {
        name: 'Refurbishment Works',
        description: 'Renewing ageing buildings and interiors to current standards with minimal disruption to occupants.',
      },
      {
        name: 'Civil Maintenance',
        description: 'Planned and reactive maintenance of building fabric, structures and external works.',
      },
      {
        name: 'Annual Maintenance Contracts (AMC)',
        description: 'Scheduled inspections, upkeep and call-out support under a fixed annual agreement.',
      },
      {
        name: 'Fit-out',
        description: 'Interior construction, partitions, ceilings, joinery and finishes for commercial, hospitality and residential spaces.',
      },
    ],
  },
  {
    id: 'finishes',
    letter: 'C',
    title: 'Specialist finishes & flooring',
    summary: 'Where the company began in 1979: coatings and surface systems applied by specialist crews.',
    services: [
      {
        name: 'Special Finishes & Decorative Coatings',
        description: 'Decorative and protective coating systems, textures and effects for walls and floors.',
      },
      {
        name: 'Micro-cement Finishes',
        description: 'Thin, seamless cementitious finishes for walls, floors and wet areas.',
      },
      {
        name: 'Stamped Concrete',
        description: 'Patterned and textured concrete paving that takes on the look of stone, brick or timber.',
      },
      {
        name: 'Polished Concrete',
        description: 'Mechanically ground and polished concrete floors that are durable, refined and easy to maintain.',
      },
      {
        name: 'Hygienic Flooring',
        description: 'Seamless, easy-to-clean resin floor systems for healthcare, food and clean environments.',
      },
      {
        name: 'Stone Carpet',
        description: 'Natural stone aggregate bound in resin for seamless, slip-resistant decorative floors.',
      },
      {
        name: 'Faux Marble Finish',
        description: 'Hand-painted marbling that recreates the veining and depth of natural stone.',
      },
      {
        name: 'Metal Coating',
        description: 'Liquid-metal and metallic-effect coatings for walls, joinery and feature elements.',
      },
      {
        name: 'Gilding',
        description: 'Gold and silver leaf applied by hand to ceilings, mouldings and ornamental details.',
      },
    ],
  },
  {
    id: 'artistic',
    letter: 'D',
    title: 'Artistic & themed works',
    summary: 'Projects that call for creative execution as much as technical precision.',
    services: [
      {
        name: 'Themed Plaster',
        description: 'Sculpted plaster and rockwork that build immersive themed environments.',
      },
      {
        name: 'Carved Plaster',
        description: 'Ornament carved directly into plaster: patterns, calligraphy and decorative panels.',
      },
      {
        name: 'Relief Works',
        description: 'Bas-relief and raised sculptural compositions for feature walls and façades.',
      },
      {
        name: '3-D Art on Walls & Floors',
        description: 'Perspective artwork that turns flat surfaces into three-dimensional illusions.',
      },
      {
        name: 'Mural Painting',
        description: 'Large-scale hand-painted murals for interiors, exteriors and public spaces.',
      },
      {
        name: 'Canvas Painting',
        description: 'Commissioned paintings on canvas, produced to suit a space and its story.',
      },
    ],
  },
];

export const serviceCount = serviceGroups.reduce((total, group) => total + group.services.length, 0);
