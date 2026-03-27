export type ProjectStage = 'Planned' | 'Tender' | 'Awarded' | 'Financing' | 'Construction' | 'Completed' | 'Cancelled' | 'Stopped';
export type ProjectStatus = 'Verified' | 'Stable' | 'Pending' | 'At Risk';
export type Region = 'MENA' | 'East Africa' | 'West Africa';
export type Sector = 'Urban Development' | 'Digital Infrastructure' | 'Renewable Energy' | 'Transport' | 'Water' | 'Energy';

export interface Evidence {
  id: string;
  source: string;
  url: string;
  type: 'Satellite' | 'Filing' | 'News' | 'Registry' | 'Partner';
  verified: boolean;
  date: string;
  title?: string;
  description?: string;
  added_by?: string;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  completed: boolean;
}

export interface Project {
  id: string;
  name: string;
  country: string;
  region: Region;
  sector: Sector;
  stage: ProjectStage;
  status: ProjectStatus;
  valueUsd: number;
  valueLabel: string;
  confidence: number;
  riskScore: number;
  lat: number;
  lng: number;
  description: string;
  stakeholders: string[];
  milestones: Milestone[];
  evidence: Evidence[];
  lastUpdated: string;
  timeline: string;
}

export const PROJECTS: Project[] = [
  {
    id: 'neom-smart-city',
    name: 'NEOM Smart City',
    country: 'Saudi Arabia',
    region: 'MENA',
    sector: 'Urban Development',
    stage: 'Construction',
    status: 'Verified',
    valueUsd: 500_000_000_000,
    valueLabel: '$500B',
    confidence: 97,
    riskScore: 12,
    lat: 28.0,
    lng: 35.2,
    description: 'Megacity project spanning 26,500 km² in Tabuk Province, featuring The Line, Trojena, Sindalah, and Oxagon sub-projects.',
    stakeholders: ['NEOM Co.', 'PIF', 'Saudi MoF', 'Bechtel', 'AECOM'],
    milestones: [
      { id: 'm1', title: 'Phase 1 foundation complete', date: '2024-06', completed: true },
      { id: 'm2', title: 'The Line excavation 40%', date: '2025-01', completed: true },
      { id: 'm3', title: 'Sindalah resort opening', date: '2025-09', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'Satellite Sentinel', url: '#', type: 'Satellite', verified: true, date: '2025-03-20' },
      { id: 'e2', source: 'Saudi Gazette', url: '#', type: 'News', verified: true, date: '2025-03-18' },
    ],
    lastUpdated: '2025-03-22',
    timeline: '2025–2039',
  },
  {
    id: 'new-admin-capital',
    name: 'New Administrative Capital',
    country: 'Egypt',
    region: 'MENA',
    sector: 'Urban Development',
    stage: 'Construction',
    status: 'Verified',
    valueUsd: 58_000_000_000,
    valueLabel: '$58B',
    confidence: 92,
    riskScore: 18,
    lat: 30.02,
    lng: 31.76,
    description: 'Egypt\'s new administrative capital 45 km east of Cairo, featuring government district, financial hub, and Africa\'s tallest tower.',
    stakeholders: ['ACUD', 'China State Construction', 'Egyptian Armed Forces', 'Dar Al-Handasah'],
    milestones: [
      { id: 'm1', title: 'Government district Phase 1', date: '2024-03', completed: true },
      { id: 'm2', title: 'Iconic Tower topped out', date: '2025-02', completed: true },
      { id: 'm3', title: 'Government relocation begins', date: '2025-06', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'Copernicus Sentinel-2', url: '#', type: 'Satellite', verified: true, date: '2025-03-15' },
      { id: 'e2', source: 'Egypt Today', url: '#', type: 'News', verified: true, date: '2025-03-10' },
    ],
    lastUpdated: '2025-03-18',
    timeline: '2015–2030',
  },
  {
    id: 'saudi-data-center',
    name: 'Saudi Data Center Complex',
    country: 'Saudi Arabia',
    region: 'MENA',
    sector: 'Digital Infrastructure',
    stage: 'Financing',
    status: 'Stable',
    valueUsd: 5_000_000_000,
    valueLabel: '$5B',
    confidence: 88,
    riskScore: 15,
    lat: 24.71,
    lng: 46.67,
    description: 'Multi-campus hyperscale data center complex in Riyadh supporting Vision 2030 digital transformation.',
    stakeholders: ['stc', 'Google Cloud', 'Oracle', 'PIF Digital'],
    milestones: [
      { id: 'm1', title: 'Site selection finalized', date: '2024-08', completed: true },
      { id: 'm2', title: 'Financial close', date: '2025-04', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'MEED Projects', url: '#', type: 'Registry', verified: true, date: '2025-03-12' },
    ],
    lastUpdated: '2025-03-14',
    timeline: '2024–2028',
  },
  {
    id: 'uae-solar-farm',
    name: 'UAE Solar Farm Al Dhafra Phase II',
    country: 'UAE',
    region: 'MENA',
    sector: 'Renewable Energy',
    stage: 'Awarded',
    status: 'Verified',
    valueUsd: 2_100_000_000,
    valueLabel: '$2.1B',
    confidence: 95,
    riskScore: 8,
    lat: 23.65,
    lng: 54.55,
    description: 'Expansion of one of the world\'s largest single-site solar plants to 4GW capacity.',
    stakeholders: ['EWEC', 'Masdar', 'EDF Renewables', 'JinkoPower'],
    milestones: [
      { id: 'm1', title: 'EPC contract awarded', date: '2024-11', completed: true },
      { id: 'm2', title: 'Construction mobilization', date: '2025-05', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'IRENA Registry', url: '#', type: 'Registry', verified: true, date: '2025-02-28' },
      { id: 'e2', source: 'Reuters', url: '#', type: 'News', verified: true, date: '2025-02-20' },
    ],
    lastUpdated: '2025-03-05',
    timeline: '2024–2027',
  },
  {
    id: 'trans-saharan-grid',
    name: 'Trans-Saharan Power Grid',
    country: 'Nigeria',
    region: 'West Africa',
    sector: 'Energy',
    stage: 'Planned',
    status: 'Pending',
    valueUsd: 12_400_000_000,
    valueLabel: '$12.4B',
    confidence: 72,
    riskScore: 42,
    lat: 9.06,
    lng: 7.49,
    description: 'Cross-border power transmission corridor connecting Nigeria to Algeria via Niger, enabling 3GW capacity exchange.',
    stakeholders: ['FGN', 'AfDB', 'Siemens Energy', 'Niger MoE'],
    milestones: [
      { id: 'm1', title: 'Pre-feasibility study', date: '2024-04', completed: true },
      { id: 'm2', title: 'MOU signing ceremony', date: '2025-01', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'AfDB Pipeline', url: '#', type: 'Filing', verified: false, date: '2025-01-15' },
    ],
    lastUpdated: '2025-02-20',
    timeline: '2025–2035',
  },
  {
    id: 'east-africa-rail',
    name: 'East Africa Standard Gauge Railway',
    country: 'Kenya',
    region: 'East Africa',
    sector: 'Transport',
    stage: 'Construction',
    status: 'Pending',
    valueUsd: 8_200_000_000,
    valueLabel: '$8.2B',
    confidence: 78,
    riskScore: 35,
    lat: -1.29,
    lng: 36.82,
    description: 'Extension of SGR from Naivasha to Kisumu and cross-border link to Kampala, part of Northern Corridor masterplan.',
    stakeholders: ['Kenya Railways', 'CRBC', 'Uganda Railways', 'EAC Secretariat'],
    milestones: [
      { id: 'm1', title: 'Nairobi–Naivasha operational', date: '2023-12', completed: true },
      { id: 'm2', title: 'Naivasha–Kisumu EIA approved', date: '2025-03', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'Kenya Gazette', url: '#', type: 'Filing', verified: true, date: '2025-02-10' },
      { id: 'e2', source: 'Sentinel-2', url: '#', type: 'Satellite', verified: false, date: '2025-01-28' },
    ],
    lastUpdated: '2025-03-01',
    timeline: '2014–2032',
  },
  {
    id: 'morocco-desalination',
    name: 'Casablanca Mega Desalination Plant',
    country: 'Morocco',
    region: 'MENA',
    sector: 'Water',
    stage: 'Tender',
    status: 'Stable',
    valueUsd: 3_600_000_000,
    valueLabel: '$3.6B',
    confidence: 85,
    riskScore: 20,
    lat: 33.57,
    lng: -7.59,
    description: 'Africa\'s largest seawater desalination plant targeting 300M m³/year capacity to serve the Casablanca-Settat region.',
    stakeholders: ['ONEE', 'MASEN', 'Abengoa', 'World Bank'],
    milestones: [
      { id: 'm1', title: 'RFQ published', date: '2025-01', completed: true },
      { id: 'm2', title: 'Technical proposals due', date: '2025-06', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'ONEE Procurement Portal', url: '#', type: 'Registry', verified: true, date: '2025-01-20' },
    ],
    lastUpdated: '2025-02-15',
    timeline: '2025–2030',
  },
  {
    id: 'lagos-rail-mass-transit',
    name: 'Lagos Blue Line Rail',
    country: 'Nigeria',
    region: 'West Africa',
    sector: 'Transport',
    stage: 'Construction',
    status: 'Verified',
    valueUsd: 2_700_000_000,
    valueLabel: '$2.7B',
    confidence: 90,
    riskScore: 22,
    lat: 6.45,
    lng: 3.41,
    description: 'Urban rail line from Okokomaiko to Marina (27 km), first phase operational, Phase 2 under construction.',
    stakeholders: ['LAMATA', 'Lagos State', 'CRCC', 'Alstom'],
    milestones: [
      { id: 'm1', title: 'Phase 1 operational', date: '2024-09', completed: true },
      { id: 'm2', title: 'Phase 2 tunneling starts', date: '2025-04', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'LAMATA Annual Report', url: '#', type: 'Filing', verified: true, date: '2025-01-30' },
      { id: 'e2', source: 'Planet Labs', url: '#', type: 'Satellite', verified: true, date: '2025-02-12' },
    ],
    lastUpdated: '2025-03-10',
    timeline: '2010–2028',
  },
  {
    id: 'tanzania-lng',
    name: 'Tanzania LNG Terminal',
    country: 'Tanzania',
    region: 'East Africa',
    sector: 'Energy',
    stage: 'Financing',
    status: 'Pending',
    valueUsd: 30_000_000_000,
    valueLabel: '$30B',
    confidence: 68,
    riskScore: 48,
    lat: -10.16,
    lng: 40.18,
    description: 'Onshore LNG processing facility in Lindi to monetize offshore gas discoveries in Block 1 and Block 4.',
    stakeholders: ['Shell', 'Equinor', 'ExxonMobil', 'TPDC', 'GoT'],
    milestones: [
      { id: 'm1', title: 'HGA signed', date: '2024-06', completed: true },
      { id: 'm2', title: 'FID expected', date: '2026-01', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'Shell Investor Update', url: '#', type: 'News', verified: true, date: '2025-02-05' },
    ],
    lastUpdated: '2025-02-15',
    timeline: '2014–2032',
  },
  {
    id: 'rwanda-kigali-innovation',
    name: 'Kigali Innovation City',
    country: 'Rwanda',
    region: 'East Africa',
    sector: 'Digital Infrastructure',
    stage: 'Construction',
    status: 'Stable',
    valueUsd: 2_000_000_000,
    valueLabel: '$2B',
    confidence: 82,
    riskScore: 25,
    lat: -1.94,
    lng: 30.09,
    description: 'Technology and innovation hub on 61 hectares, housing universities, tech companies, and a biotech research center.',
    stakeholders: ['GoR', 'Africa50', 'CMU Africa', 'Positivo BGH'],
    milestones: [
      { id: 'm1', title: 'Phase 1 infrastructure', date: '2024-12', completed: true },
      { id: 'm2', title: 'First academic campus opens', date: '2025-09', completed: false },
    ],
    evidence: [
      { id: 'e1', source: 'Rwanda Development Board', url: '#', type: 'Registry', verified: true, date: '2025-01-10' },
    ],
    lastUpdated: '2025-02-28',
    timeline: '2019–2028',
  },
];

export const REGIONS: Region[] = ['MENA', 'East Africa', 'West Africa'];
export const SECTORS: Sector[] = ['Urban Development', 'Digital Infrastructure', 'Renewable Energy', 'Transport', 'Water', 'Energy'];
export const STAGES: ProjectStage[] = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed', 'Cancelled', 'Stopped'];

export const statusColor: Record<ProjectStatus, string> = {
  'Verified': '#10b981',
  'Stable': '#6bd8cb',
  'Pending': '#f59e0b',
  'At Risk': '#ef4444',
};

export const stageColor: Record<string, string> = {
  'Planned': '#6bd8cb',
  'Tender': '#60a5fa',
  'Awarded': '#34d399',
  'Financing': '#fbbf24',
  'Construction': '#10b981',
  'Completed': '#6b7280',
  'Cancelled': '#ef4444',
  'Stopped': '#ef4444',
};

export function formatValue(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}
