import { Button } from '@/components/ui/button';

export const REVIEW_PAGE_SIZE = 25;

export function Pager({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
      <span>{total === 0 ? '0' : page * REVIEW_PAGE_SIZE + 1}–{Math.min((page + 1) * REVIEW_PAGE_SIZE, total)} of {total}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
        <span>Page {page + 1} of {totalPages}</span>
        <Button size="sm" variant="outline" onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page + 1 >= totalPages}>Next</Button>
      </div>
    </div>
  );
}

export interface EvidenceRow {
  id: string;
  source: string;
  url: string;
  type: string;
  verified: boolean;
  date: string;
  title: string | null;
}

export interface ContactRow {
  id: string;
  name: string;
  role: string;
  organization: string;
  email: string | null;
  phone: string | null;
  contact_type: string;
  source_url: string | null;
  verified: boolean;
}

