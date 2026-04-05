export type ProjectStage = 'Planned' | 'Tender' | 'Awarded' | 'Financing' | 'Construction' | 'Completed' | 'Cancelled' | 'Stopped';
export type ProjectStatus = 'Verified' | 'Stable' | 'Pending' | 'At Risk';
export type Region = 'MENA' | 'East Africa' | 'West Africa' | 'Southern Africa' | 'Central Africa' | 'North America' | 'South America' | 'Europe' | 'Central Asia' | 'South Asia' | 'East Asia' | 'Southeast Asia' | 'Oceania' | 'Caribbean';
export type Sector =
  | 'AI Infrastructure'
  | 'Building Construction'
  | 'Chemical'
  | 'Data Centers'
  | 'Digital Infrastructure'
  | 'Energy'
  | 'Industrial'
  | 'Infrastructure'
  | 'Mining'
  | 'Oil & Gas'
  | 'Renewable Energy'
  | 'Transport'
  | 'Urban Development'
  | 'Water';

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

export type ContactType = 'contractor' | 'government' | 'financier' | 'consultant' | 'owner' | 'general';

export interface Contact {
  id: string;
  name: string;
  role: string;
  organization: string;
  phone: string | null;
  email: string | null;
  source: string;
  source_url: string | null;
  verified: boolean;
  added_by: string;
  contact_type: ContactType;
  created_at: string;
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
  contacts?: Contact[];
  lastUpdated: string;
  timeline: string;
  detailedAnalysis?: string;
  keyRisks?: string;
  fundingSources?: string;
  environmentalImpact?: string;
  politicalContext?: string;
  sourceUrl?: string;
  dbId?: string;
  /** Set when created via Project Editor */
  createdByUserId?: string | null;
  /** Set when saved from Research → review queue */
  researchSavedByUserId?: string | null;
}


export const REGIONS: Region[] = ['MENA', 'East Africa', 'West Africa', 'Southern Africa', 'Central Africa', 'North America', 'South America', 'Europe', 'Central Asia', 'South Asia', 'East Asia', 'Southeast Asia', 'Oceania', 'Caribbean'];
export const SECTORS: Sector[] = [
  'AI Infrastructure',
  'Building Construction',
  'Chemical',
  'Data Centers',
  'Digital Infrastructure',
  'Energy',
  'Industrial',
  'Infrastructure',
  'Mining',
  'Oil & Gas',
  'Renewable Energy',
  'Transport',
  'Urban Development',
  'Water',
];
export const STAGES: ProjectStage[] = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed', 'Cancelled', 'Stopped'];

export const statusColor: Record<ProjectStatus, string> = {
  'Verified': '#10b981',
  'Stable': '#6bd8cb',
  'Pending': '#f59e0b',
  'At Risk': '#ef4444',
};


export function formatValue(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}
