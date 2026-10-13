import jsPDF from 'jspdf';
import type { Project } from '@/data/projects';
import { applyPdfWatermark, buildWatermarkLabel } from '@/lib/billing/exportCaps';

export function exportTearsheet(project: Project, email?: string) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const colRight = pageW / 2 + 5;
    let y = 15;

    // Header bar
    doc.setFillColor(30, 30, 45);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(project.name, margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(180, 180, 200);
    doc.text(`${project.country} · ${project.region} · ${project.sector}`, margin, 22);
    doc.text('InfradarAI Intelligence', pageW - margin, 22, { align: 'right' });
    y = 36;

    // Key metrics row
    const metrics = [
      { label: 'Stage', value: project.stage },
      { label: 'Status', value: project.status },
      { label: 'Value', value: project.valueLabel || 'N/A' },
      { label: 'Confidence', value: `${project.confidence}%` },
      { label: 'Risk Score', value: String(project.riskScore ?? 'N/A') },
    ];
    const boxW = (pageW - margin * 2 - 4 * 4) / 5;
    metrics.forEach((m, i) => {
      const bx = margin + i * (boxW + 4);
      doc.setFillColor(40, 40, 58);
      doc.roundedRect(bx, y, boxW, 18, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(200, 235, 255);
      doc.text(m.value, bx + boxW / 2, y + 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(130, 140, 160);
      doc.text(m.label, bx + boxW / 2, y + 15, { align: 'center' });
    });
    y += 26;

    // Description
    if (project.description) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 220, 235);
      doc.text('Project Overview', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(160, 165, 180);
      const descLines = doc.splitTextToSize(project.description, pageW - margin * 2);
      doc.text(descLines.slice(0, 6), margin, y);
      y += Math.min(descLines.length, 6) * 4.5 + 6;
    }

    // Two-column: Contacts (left) + Key facts (right)
    const colStart = y;
    const halfW = (pageW - margin * 2 - 8) / 2;

    // Left: contacts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 235);
    doc.text('Key Contacts', margin, colStart);
    let leftY = colStart + 6;
    const contactList = (project.contacts || []).slice(0, 5);
    if (contactList.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120, 125, 140);
      doc.text('No contacts recorded', margin, leftY);
      leftY += 5;
    } else {
      contactList.forEach(c => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(200, 210, 230);
        doc.text(c.name || 'Unknown', margin, leftY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(130, 140, 155);
        doc.text(`${c.role || ''} · ${c.organization || ''}`, margin, leftY + 4);
        leftY += 10;
      });
    }

    // Right: Key facts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 235);
    doc.text('Project Details', colRight, colStart);
    let rightY = colStart + 6;
    const facts = [
      ['Country', project.country],
      ['Region', project.region],
      ['Sector', project.sector],
      ['Stage', project.stage],
      ['Last Updated', project.lastUpdated || 'N/A'],
      ...(project.sourceUrl ? [['Source', project.sourceUrl.slice(0, 40)]] : []),
    ] as [string, string][];
    facts.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(140, 150, 165);
      doc.text(k + ':', colRight, rightY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 210, 225);
      doc.text(v, colRight + 28, rightY);
      rightY += 5.5;
    });

    y = Math.max(leftY, rightY) + 6;

    // AI Analysis excerpt (if available)
    if (project.detailedAnalysis) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 220, 235);
      doc.text('AI Analysis (excerpt)', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(150, 160, 175);
      const analysisLines = doc.splitTextToSize(project.detailedAnalysis, pageW - margin * 2);
      doc.text(analysisLines.slice(0, 8), margin, y);
    }

    const watermark = buildWatermarkLabel(email);
    applyPdfWatermark(doc, watermark);
    const slug = project.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    doc.save(`infradar_tearsheet_${slug}.pdf`);
}
