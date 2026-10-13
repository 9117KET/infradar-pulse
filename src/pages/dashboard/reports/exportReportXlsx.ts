type ReportLike = {
  title: string | null;
  report_type: string;
  markdown: string | null;
  created_at: string;
  citations?: Array<{ label: string; url: string }> | null;
  parameters?: Record<string, unknown> | null;
};

type TopProject = {
  name?: string; country?: string; sector?: string; stage?: string; status?: string;
  value_label?: string; confidence?: number; risk_score?: number; source_url?: string;
};

/** Excel workbook: Summary, Projects (from report metrics), Report text, Sources. */
export async function exportReportXlsx(report: ReportLike, watermark: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InfradarAI';
  const params = (report.parameters ?? {}) as Record<string, unknown>;
  const metrics = (params.metrics ?? {}) as Record<string, unknown>;

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 90 }];
  const rows: Array<[string, unknown]> = [
    ['Report', report.title ?? report.report_type],
    ['Generated', new Date(report.created_at).toLocaleString()],
    ['Scope', params.scope_label],
    ['Depth', params.depth_label],
    ['Window (days)', params.days],
    ['Projects analysed', metrics.project_count],
    ['Pipeline value', metrics.total_value_label],
    ['Average confidence', metrics.avg_confidence],
    ['High-risk projects', metrics.high_risk_projects],
    ['Critical alerts', metrics.critical_alerts],
    ['Fresh web searches used', params.live_searches_used ?? 0],
    ['Summary', params.summary],
    ['Licensed to', watermark],
  ];
  rows.forEach(([k, v]) => summary.addRow([k, v == null ? '' : String(v)]));
  summary.getColumn(1).font = { bold: true };
  summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const projects = wb.addWorksheet('Projects');
  projects.columns = [
    { header: 'Project', key: 'name', width: 42 }, { header: 'Country', key: 'country', width: 16 },
    { header: 'Sector', key: 'sector', width: 20 }, { header: 'Stage', key: 'stage', width: 14 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Value', key: 'value_label', width: 14 },
    { header: 'Confidence', key: 'confidence', width: 12 }, { header: 'Risk', key: 'risk_score', width: 8 },
    { header: 'Source', key: 'source_url', width: 60 },
  ];
  for (const p of (metrics.top_projects ?? []) as TopProject[]) projects.addRow(p);
  projects.getRow(1).font = { bold: true };
  projects.autoFilter = { from: 'A1', to: 'I1' };

  const text = wb.addWorksheet('Report');
  text.getColumn(1).width = 140;
  (report.markdown ?? '').split('\n').forEach((line) => {
    const row = text.addRow([line]);
    if (line.startsWith('#')) row.font = { bold: true, size: line.startsWith('##') ? 12 : 14 };
  });
  text.getColumn(1).alignment = { wrapText: true };

  const sources = wb.addWorksheet('Sources');
  sources.columns = [{ header: '#', width: 6 }, { header: 'Source', width: 50 }, { header: 'URL', width: 80 }];
  (report.citations ?? []).forEach((c, i) => sources.addRow([i + 1, c.label, c.url]));
  sources.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `infradar_report_${(report.title || report.report_type).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
