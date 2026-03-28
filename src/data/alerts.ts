export type AlertCategory = 'political' | 'financial' | 'regulatory' | 'supply_chain' | 'environmental' | 'construction' | 'stakeholder' | 'market' | 'security';

export const ALERT_CATEGORIES: { value: AlertCategory; label: string }[] = [
  { value: 'political', label: 'Political' },
  { value: 'financial', label: 'Financial' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'supply_chain', label: 'Supply Chain' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'construction', label: 'Construction' },
  { value: 'stakeholder', label: 'Stakeholder' },
  { value: 'market', label: 'Market' },
  { value: 'security', label: 'Security' },
];

export interface Alert {
  id: string;
  projectId: string;
  projectName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: AlertCategory;
  message: string;
  time: string;
  read: boolean;
  sourceUrl?: string;
}

export const ALERTS: Alert[] = [
  { id: 'a1', projectId: 'trans-saharan-grid', projectName: 'Trans-Saharan Power Grid', severity: 'high', category: 'political', message: 'MOU signing delayed — political instability in Niger', time: '2h ago', read: false },
  { id: 'a2', projectId: 'neom-smart-city', projectName: 'NEOM Smart City', severity: 'low', category: 'construction', message: 'Sindalah resort construction ahead of schedule', time: '5h ago', read: false },
  { id: 'a3', projectId: 'tanzania-lng', projectName: 'Tanzania LNG Terminal', severity: 'critical', category: 'financial', message: 'FID timeline at risk — partner renegotiation signals', time: '1d ago', read: true },
  { id: 'a4', projectId: 'east-africa-rail', projectName: 'East Africa Rail', severity: 'medium', category: 'regulatory', message: 'EIA approval pending — community consultations ongoing', time: '2d ago', read: true },
  { id: 'a5', projectId: 'lagos-rail-mass-transit', projectName: 'Lagos Blue Line Rail', severity: 'low', category: 'construction', message: 'Phase 2 tunneling equipment arrived at site', time: '3d ago', read: true },
  { id: 'a6', projectId: 'morocco-desalination', projectName: 'Casablanca Desalination', severity: 'medium', category: 'stakeholder', message: 'Two bidders disqualified at PQ stage', time: '4d ago', read: true },
];
