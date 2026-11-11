/**
 * Sectors served. Names come from the client brief; the descriptions were drafted
 * for the website. TODO(client): review descriptions.
 *
 * `icon` is a Phosphor icon name (see src/components/Icon.astro).
 * `image` is a file name in src/assets/images (see src/data/images.ts).
 */

export interface Sector {
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
}

export const sectors: Sector[] = [
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    description: 'Civil structures, utilities and enabling works that keep a growing city connected.',
    icon: 'bridge',
    image: 'sector-infrastructure',
  },
  {
    id: 'buildings',
    name: 'Buildings',
    description: 'Residential, commercial and mixed-use buildings, from structure through to handover.',
    icon: 'buildings',
    image: 'sector-buildings',
  },
  {
    id: 'palatial-villas',
    name: 'Palatial Villas',
    description: 'Private residences finished to the highest order of craft and detail.',
    icon: 'house-line',
    image: 'sector-palatial-villas',
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Warehouses, workshops and production facilities built for hard daily use.',
    icon: 'factory',
    image: 'sector-industrial',
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Clinical environments where hygiene, compliance and continuity of care come first.',
    icon: 'hospital',
    image: 'sector-healthcare',
  },
  {
    id: 'hospitality',
    name: 'Hospitality',
    description: 'Hotels, resorts and restaurants shaped around the guest experience.',
    icon: 'bed',
    image: 'sector-hospitality',
  },
  {
    id: 'house-of-worship',
    name: 'House of Worship',
    description: 'Mosques and places of worship, built with reverence for proportion and detail.',
    icon: 'mosque',
    image: 'sector-house-of-worship',
  },
  {
    id: 'fuel-facilities',
    name: 'Fuel Facilities',
    description: 'Service stations and fuel infrastructure delivered to strict safety standards.',
    icon: 'gas-pump',
    image: 'sector-fuel-facilities',
  },
  {
    id: 'data-centers',
    name: 'Data Centers & Service Blocks',
    description: 'Mission-critical facilities and the service buildings that keep them running.',
    icon: 'hard-drives',
    image: 'sector-data-centers',
  },
  {
    id: 'airports',
    name: 'Airports',
    description: 'Works carried out inside live, security-controlled aviation environments.',
    icon: 'airplane-takeoff',
    image: 'sector-airports',
  },
  {
    id: 'university',
    name: 'University',
    description: 'Campuses, lecture halls and research facilities built to last generations.',
    icon: 'graduation-cap',
    image: 'sector-university',
  },
  {
    id: 'parks',
    name: 'Parks',
    description: 'Public parks, landscapes and themed leisure spaces for communities to share.',
    icon: 'tree-palm',
    image: 'sector-parks',
  },
  {
    id: 'schools',
    name: 'Schools',
    description: 'Safe, durable learning environments delivered around the academic calendar.',
    icon: 'chalkboard-teacher',
    image: 'sector-schools',
  },
  {
    id: 'malls',
    name: 'Malls',
    description: 'Retail destinations and fit-outs inside operating shopping centres.',
    icon: 'storefront',
    image: 'sector-malls',
  },
];

export const sectorById = new Map(sectors.map((sector) => [sector.id, sector]));
