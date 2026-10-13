export interface VerificationEntry {
  id: string;
  action: string;
  reason: string;
  performed_by: string | null;
  created_at: string;
}

export interface ChangelogEntry {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  source: string | null;
  created_at: string;
}

export interface RiskHistoryPoint {
  date: string;
  score: number;
}
