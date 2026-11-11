/**
 * Sectors served. Names come from the client brief; the descriptions were drafted
 * for the website. TODO(client): review descriptions.
 *
 * `icon` holds the inner markup of a 64×64 line drawing (a miniature elevation).
 * The same drawings double as placeholder artwork wherever a photograph is missing.
 */

export interface Sector {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const ground = '<path d="M6 54h52"/>';

export const sectors: Sector[] = [
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    description: 'Civil structures, utilities and enabling works that keep a growing city connected.',
    icon: `<path d="M6 34h52M6 38h52"/><path d="M32 8v46"/><path d="M32 10 10 34M32 10 20 34M32 10l-5 24M32 10l22 24M32 10l12 24M32 10l5 24"/>${ground}`,
  },
  {
    id: 'buildings',
    name: 'Buildings',
    description: 'Residential, commercial and mixed-use buildings, from structure through to handover.',
    icon: `<path d="M14 54V10h16v44M34 54V24h16v30"/><path d="M14 18h16M14 26h16M14 34h16M14 42h16M34 32h16M34 40h16"/>${ground}`,
  },
  {
    id: 'palatial-villas',
    name: 'Palatial Villas',
    description: 'Private residences finished to the highest order of craft and detail.',
    icon: `<path d="M10 54V36h14M40 36h14v18"/><path d="M24 54V28h16v26"/><path d="M24 28a8 8 0 0 1 16 0"/><path d="M32 20v-5"/><path d="M29 54V45a3 3 0 0 1 6 0v9"/><path d="M14 54v-9a2 2 0 0 1 4 0v9M46 54v-9a2 2 0 0 1 4 0v9"/>${ground}`,
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Warehouses, workshops and production facilities built for hard daily use.',
    icon: `<path d="M8 54V34l10-8v8l10-8v8l10-8v28"/><path d="M44 54V12h6v42"/><path d="M14 54v-9h8v9"/>${ground}`,
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Clinical environments where hygiene, compliance and continuity of care come first.',
    icon: `<path d="M12 54V20h40v34"/><path d="M24 20v-7h16v7"/><path d="M32 27v12M26 33h12"/><path d="M28 54v-9h8v9"/>${ground}`,
  },
  {
    id: 'hospitality',
    name: 'Hospitality',
    description: 'Hotels, resorts and restaurants shaped around the guest experience.',
    icon: `<path d="M18 54V12h28v42"/><path d="M24 20h4M36 20h4M24 28h4M36 28h4"/><path d="M14 44h36l-4-7H18z"/><path d="M29 54v-10h6v10"/>${ground}`,
  },
  {
    id: 'house-of-worship',
    name: 'House of Worship',
    description: 'Mosques and places of worship, built with reverence for proportion and detail.',
    icon: `<path d="M14 54V36h30v18"/><path d="M18 36a11 11 0 0 1 22 0"/><path d="M29 25v-6"/><path d="M25 54v-8a4 4 0 0 1 8 0v8"/><path d="M49 54V20h5v34"/><path d="M49 20l2.5-7 2.5 7"/>${ground}`,
  },
  {
    id: 'fuel-facilities',
    name: 'Fuel Facilities',
    description: 'Service stations and fuel infrastructure delivered to strict safety standards.',
    icon: `<path d="M8 20h38v6H8z"/><path d="M14 26v28M40 26v28"/><path d="M23 54V38h8v16"/><path d="M25 43h4"/><path d="M54 54V14"/><path d="M50 14h8v9h-8z"/>${ground}`,
  },
  {
    id: 'data-centers',
    name: 'Data Centers & Service Blocks',
    description: 'Mission-critical facilities and the service buildings that keep them running.',
    icon: `<path d="M8 54V24h48v30"/><path d="M16 31v16M22 31v16M28 31v16M34 31v16M40 31v16M46 31v16"/><path d="M13 24v-6h9v6M27.5 24v-6h9v6M42 24v-6h9v6"/>${ground}`,
  },
  {
    id: 'airports',
    name: 'Airports',
    description: 'Works carried out inside live, security-controlled aviation environments.',
    icon: `<path d="M20 54V28h5v26"/><path d="M14 28l2-9h13l2 9z"/><path d="M22.5 19v-9"/><path d="M30 54V44q12-10 28-3v13"/><path d="M36 54v-8M44 54v-10M52 54v-10"/>${ground}`,
  },
  {
    id: 'university',
    name: 'University',
    description: 'Campuses, lecture halls and research facilities built to last generations.',
    icon: `<path d="M10 26 32 12l22 14z"/><path d="M12 26v4h40v-4"/><path d="M17 30v19M27 30v19M37 30v19M47 30v19"/><path d="M10 54v-5h44v5"/>${ground}`,
  },
  {
    id: 'parks',
    name: 'Parks',
    description: 'Public parks, landscapes and themed leisure spaces for communities to share.',
    icon: `<circle cx="22" cy="24" r="12"/><path d="M22 36v18M22 44l5-5"/><circle cx="45" cy="33" r="8"/><path d="M45 41v13"/>${ground}`,
  },
  {
    id: 'schools',
    name: 'Schools',
    description: 'Safe, durable learning environments delivered around the academic calendar.',
    icon: `<path d="M10 54V34h14M40 34h14v20"/><path d="M24 54V25l8-7 8 7v29"/><path d="M32 18V8h7v5h-7"/><path d="M29 54v-9h6v9"/><path d="M14 40h6v6h-6zM44 40h6v6h-6z"/>${ground}`,
  },
  {
    id: 'malls',
    name: 'Malls',
    description: 'Retail destinations and fit-outs inside operating shopping centres.',
    icon: `<path d="M8 54V22h48v32"/><path d="M8 29h48"/><path d="M22 54V40a10 10 0 0 1 20 0v14"/><path d="M32 30v24"/><path d="M12 54v-14h6v14M46 54v-14h6v14"/>${ground}`,
  },
];

export const sectorById = new Map(sectors.map((sector) => [sector.id, sector]));

/** Extra line drawings used on the history timeline and as generic placeholders. */
export const drawings: Record<string, string> = {
  coating: `<path d="M12 12h32v11H12z"/><path d="M44 17h8v14H30v8"/><path d="M27 39h6v15h-6z"/>`,
  scaffold: `<path d="M16 54V12M48 54V12"/><path d="M12 24h40M12 39h40"/><path d="M16 24l32 15M48 39 16 54"/><path d="M22 24v-6h20v6"/>${ground}`,
  crane: `<path d="M20 54V10"/><path d="M8 16h48"/><path d="M20 8 8 16M20 8l30 8"/><path d="M12 16v6h6v-6"/><path d="M44 16v15"/><path d="M41 31h6v4h-6z"/><path d="M34 54V40h20v14M34 47h20M44 40v14"/>${ground}`,
  skyline: `<path d="M8 54V34h8v20M18 54V22h9v32M29 54V8l5 6v40M36 54V28h8v26M46 54V16h8v38"/><path d="M18 30h9M18 38h9M46 24h8M46 32h8M46 40h8"/>${ground}`,
  handshake: `<circle cx="24" cy="30" r="14"/><circle cx="40" cy="30" r="14"/>${ground}`,
  orbit: `<circle cx="32" cy="32" r="6"/><ellipse cx="32" cy="32" rx="25" ry="11" transform="rotate(-24 32 32)"/><circle cx="53.5" cy="19" r="2.5" fill="currentColor"/>`,
};
