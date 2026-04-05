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
  createdAt: string;
  read: boolean;
  sourceUrl?: string;
}

