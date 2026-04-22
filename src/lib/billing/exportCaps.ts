/**
 * Helpers shared by every export call site. Keeps the truncation policy +
 * watermark string in one place so they cannot drift between CSV and PDF
 * exporters.
 */
import jsPDF from 'jspdf';
import { getExportRowCap, PlanKey } from './limits';

export type CapResult<T> = {
  rows: T[];
  total: number;
  cap: number;
  truncated: boolean;
};

export function applyExportCap<T>(rows: T[], plan: PlanKey, staffBypass: boolean): CapResult<T> {
  const cap = staffBypass ? 0 : getExportRowCap(plan);
  if (cap <= 0 || rows.length <= cap) {
    return { rows, total: rows.length, cap, truncated: false };
  }
  return { rows: rows.slice(0, cap), total: rows.length, cap, truncated: true };
}

/**
 * Build the per-user watermark string stamped on every export. Includes the
 * user's email + UTC timestamp so a leaked file can be traced back to the
 * account that exported it.
 */
export function buildWatermarkLabel(email: string | null | undefined): string {
  const who = email && email.trim() ? email.trim() : 'unidentified-user';
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return `Licensed to ${who} · ${when} · InfraRadar`;
}

/**
 * CSV header preamble explaining the watermark. Spreadsheets ignore lines
 * starting with `#` only in some tools, so we prefix with an extra column
 * inside quotes to keep the file valid CSV everywhere.
 */
export function buildCsvHeaderComment(label: string, truncated: CapResult<unknown>): string[] {
  const lines = [`"# ${label}"`];
  if (truncated.truncated) {
    lines.push(`"# Showing ${truncated.cap} of ${truncated.total} rows. Upgrade for higher export caps."`);
  }
  return lines;
}

/**
 * Stamp a diagonal semi-transparent watermark + footer line on every page of
 * a jsPDF document. Call AFTER all content has been drawn (so it appears on
 * top) but BEFORE `doc.save(...)`.
 */
export function applyPdfWatermark(doc: jsPDF, label: string): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Diagonal watermark across the page.
    const gState = (doc as unknown as { GState?: new (opts: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState?: (gs: unknown) => void }).setGState;
    if (gState && setGState) {
      const transparent = new gState({ opacity: 0.12 });
      setGState.call(doc, transparent);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(48);
    doc.setTextColor(120, 120, 140);
    doc.text(label, w / 2, h / 2, { align: 'center', angle: 30 });

    // Reset opacity for the footer.
    if (gState && setGState) {
      const opaque = new gState({ opacity: 1 });
      setGState.call(doc, opaque);
    }

    // Footer strip.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(label, w / 2, h - 6, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, w - 12, h - 6, { align: 'right' });
  }
}
