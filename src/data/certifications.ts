/**
 * Certifications. The brief lists the three headings only.
 *
 * TODO(client): supply the specific standards, certificate numbers, issuing bodies,
 * validity dates and scans. Fill `details` and `document` to show them on the page.
 */

export interface Certification {
  id: string;
  icon: string;
  short: string;
  name: string;
  description: string;
  details: { label: string; value: string }[];
  document?: string;
}

export const certifications: Certification[] = [
  {
    id: 'iso',
    icon: 'seal-check',
    short: 'ISO',
    name: 'ISO certification',
    description:
      'Our management systems are independently audited and certified to international ISO standards, giving clients and consultants a recognised benchmark for how we plan, deliver and review our work.',
    details: [],
  },
  {
    id: 'icv',
    icon: 'certificate',
    short: 'ICV',
    name: 'ICV certification',
    description:
      "We are certified under the UAE's National In-Country Value (ICV) Program, which measures a company's contribution to the national economy through local procurement, investment and employment.",
    details: [],
  },
  {
    id: 'other',
    icon: 'medal',
    short: '+',
    name: 'Other certifications',
    description:
      'Further certifications, registrations and approvals held by the company are available to clients and consultants on request as part of prequalification.',
    details: [],
  },
];
