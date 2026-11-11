/**
 * Single source of truth for company details, navigation and contact information.
 *
 * Everything marked TODO(client) is a placeholder that was not part of the brief
 * and must be confirmed before launch.
 */

export const site = {
  name: 'Al Madar MGM Construction LLC',
  shortName: 'Al Madar MGM',
  legalSuffix: 'Construction LLC',

  tagline: '47 Years of Building Trust. A Future of Building Excellence.',
  motto: 'Our legacy. Our commitment. Our future.',

  description:
    'Dubai construction company established in 1979. Civil construction, building contracting, MEP, fit-out, maintenance and specialist finishes across the UAE.',

  founded: 1979,
  years: 47,

  // Colour palette: 'ember' | 'cobalt' | 'crimson' | 'highvis' (defined in src/styles/global.css).
  palette: 'ember',

  locality: 'Dubai',
  country: 'United Arab Emirates',
  countryCode: 'AE',
} as const;

export const contact = {
  // TODO(client): confirm every value in this block. None of it was supplied in the brief.
  email: 'info@example.com',
  careersEmail: 'careers@example.com',
  phone: '',
  hours: 'Sunday to Thursday',

  // Leave empty to fall back to an email draft; set to a form backend URL
  // (Formspree, Web3Forms, a serverless function…) to submit enquiries in place.
  formEndpoint: import.meta.env.PUBLIC_FORM_ENDPOINT ?? '',

  locations: [
    {
      name: 'Head office',
      lines: ['Dubai', 'United Arab Emirates'],
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dubai%2C+United+Arab+Emirates',
    },
  ],
};

export const groupCompanies = [
  // TODO(client): add a one-line description and website for each group company.
  { name: 'MJK Arabia LLC', url: '' },
  { name: 'JK Enterprises', url: '' },
];

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const mainNav: NavItem[] = [
  {
    label: 'About us',
    href: '/about/',
    children: [
      { label: 'Mission & vision', href: '/about/#mission' },
      { label: 'Message from the MD', href: '/about/#message' },
      { label: 'History', href: '/about/history/' },
      { label: 'The team', href: '/about/team/' },
      { label: 'Group companies', href: '/about/#group' },
    ],
  },
  { label: 'Services', href: '/services/' },
  { label: 'Sectors', href: '/sectors/' },
  { label: 'Projects', href: '/projects/' },
  { label: 'Certifications', href: '/certifications/' },
];

export const footerNav: { title: string; links: NavItem[] }[] = [
  {
    title: 'Company',
    links: [
      { label: 'About us', href: '/about/' },
      { label: 'History', href: '/about/history/' },
      { label: 'The team', href: '/about/team/' },
      { label: 'Certifications', href: '/certifications/' },
    ],
  },
  {
    title: 'Work',
    links: [
      { label: 'Services', href: '/services/' },
      { label: 'Sectors', href: '/sectors/' },
      { label: 'Projects', href: '/projects/' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { label: 'Contact us', href: '/contact/' },
      { label: 'Subcontractors & suppliers', href: '/contact/#register' },
      { label: 'Careers', href: '/contact/#careers' },
      { label: 'Locations', href: '/contact/#locations' },
    ],
  },
];
