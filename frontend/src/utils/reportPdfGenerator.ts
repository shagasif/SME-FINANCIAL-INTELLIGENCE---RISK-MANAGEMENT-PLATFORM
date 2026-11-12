import type { ExecutiveBrief, ReportRecord } from '../types/reports.types';

/**
 * Sanitizes Unicode characters unsupported by standard PDF WinAnsiEncoding
 * while keeping tabular financial numerals, punctuation, and labels intact.
 */
function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, ' | ')
    .replace(/[^\x20-\x7E]/g, '');
}

function escapePdfString(text: string): string {
  return sanitizePdfText(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function approxTextWidth(text: string, fontSize: number, bold = false): number {
  const factor = bold ? 0.54 : 0.5;
  return sanitizePdfText(text).length * fontSize * factor;
}

function shortDate(iso?: string): string {
  if (!iso) return 'N/A';
  return iso.slice(0, 10);
}

/**
 * Generates a real, multi-page binary PDF 1.4 document (%PDF-1.4) whose layout,
 * sections, KPIs, financial tables, risks, action plan, and citations mirror
 * the Executive Brief rendered in the Report Inspection Drawer.
 */
export function buildExecutiveReportPdfBytes(
  report: ReportRecord,
  brief: ExecutiveBrief,
  organizationName: string,
): Uint8Array {
  const PAGE_W = 595.28; // A4 width in pt
  const PAGE_H = 841.89; // A4 height in pt
  const MARGIN_X = 44;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const TOP_Y = PAGE_H - 48;
  const BOTTOM_Y = 52;

  const pages: string[][] = [[]];
  let pageIndex = 0;
  let cursorY = TOP_Y;

  const emit = (cmd: string) => {
    pages[pageIndex].push(cmd);
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    bold = false,
    rgb: [number, number, number] = [0.094, 0.114, 0.106],
  ) => {
    const font = bold ? '/F2' : '/F1';
    emit(
      `BT ${font} ${size} Tf ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfString(text)}) Tj ET`,
    );
  };

  const drawRightText = (
    text: string,
    rightX: number,
    y: number,
    size: number,
    bold = false,
    rgb: [number, number, number] = [0.094, 0.114, 0.106],
  ) => {
    const w = approxTextWidth(text, size, bold);
    drawText(text, Math.max(MARGIN_X, rightX - w), y, size, bold, rgb);
  };

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillRgb?: [number, number, number],
    strokeRgb?: [number, number, number],
  ) => {
    if (fillRgb && strokeRgb) {
      emit(
        `${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`,
      );
    } else if (fillRgb) {
      emit(
        `${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
      );
    } else if (strokeRgb) {
      emit(
        `${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`,
      );
    }
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: [number, number, number] = [0.855, 0.827, 0.765],
    width = 0.6,
  ) => {
    emit(
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  };

  const ensureSpace = (neededPt: number) => {
    if (cursorY - neededPt < BOTTOM_Y) {
      pages.push([]);
      pageIndex += 1;
      cursorY = TOP_Y;
    }
  };

  const drawSectionHeading = (title: string, badge?: string) => {
    ensureSpace(34);
    cursorY -= 8;
    drawText(title.toUpperCase(), MARGIN_X, cursorY, 9.5, true, [0.086, 0.22, 0.173]);
    if (badge) {
      drawRightText(`[${badge}]`, PAGE_W - MARGIN_X, cursorY, 8, true, [0.361, 0.412, 0.392]);
    }
    cursorY -= 5;
    drawLine(MARGIN_X, cursorY, PAGE_W - MARGIN_X, cursorY, [0.855, 0.827, 0.765], 0.8);
    cursorY -= 14;
  };

  // --- Document Header Banner ---
  drawRect(MARGIN_X, cursorY - 46, CONTENT_W, 56, [0.965, 0.953, 0.925], [0.855, 0.827, 0.765]);
  drawRect(MARGIN_X, cursorY - 46, 5, 56, [0.086, 0.22, 0.173]);
  drawText(organizationName.toUpperCase(), MARGIN_X + 14, cursorY - 4, 8, true, [0.122, 0.431, 0.424]);
  drawRightText(
    `${brief.reportType.replace(/_/g, ' ')} | ${brief.dataGrounding.currency}`,
    PAGE_W - MARGIN_X - 10,
    cursorY - 4,
    8.5,
    true,
    [0.086, 0.22, 0.173],
  );

  const titleLines = wrapText(report.title, 68).slice(0, 2);
  let titleY = cursorY - 20;
  for (const tl of titleLines) {
    drawText(tl, MARGIN_X + 14, titleY, 13, true, [0.094, 0.114, 0.106]);
    titleY -= 15;
  }
  drawText(
    `Reporting Period: ${shortDate(brief.dataGrounding.reportingPeriodStart)} to ${shortDate(brief.dataGrounding.reportingPeriodEnd)}   |   Generated: ${shortDate(report.createdAt)}`,
    MARGIN_X + 14,
    cursorY - 40,
    8,
    false,
    [0.361, 0.412, 0.392],
  );
  cursorY -= 62;

  // --- 1. Executive Summary ---
  drawSectionHeading('Executive Summary', 'Grounded Brief');
  for (const sentence of brief.executiveSummary) {
    const lines = wrapText(sentence, 92);
    ensureSpace(lines.length * 13 + 6);
    for (const line of lines) {
      drawText(line, MARGIN_X, cursorY, 9.5, false, [0.235, 0.278, 0.263]);
      cursorY -= 13;
    }
    cursorY -= 3;
  }

  // --- 2. Key Financial KPIs (2x2 compact grid) ---
  if (brief.kpis.length > 0) {
    drawSectionHeading('Key Financial KPIs', 'Verified Ledger');
    const colGap = 10;
    const cardW = (CONTENT_W - colGap) / 2;
    const cardH = 52;
    for (let i = 0; i < brief.kpis.length; i += 2) {
      ensureSpace(cardH + 8);
      for (let col = 0; col < 2; col += 1) {
        const kpi = brief.kpis[i + col];
        if (!kpi) continue;
        const x = MARGIN_X + col * (cardW + colGap);
        const y = cursorY - cardH + 10;
        drawRect(x, y, cardW, cardH, [0.98, 0.973, 0.953], [0.855, 0.827, 0.765]);
        drawText(kpi.label.toUpperCase(), x + 10, y + cardH - 13, 7.5, true, [0.361, 0.412, 0.392]);
        drawText(
          kpi.secondaryValue ? `${kpi.value} | ${kpi.secondaryLabel ?? ''} ${kpi.secondaryValue}` : kpi.value,
          x + 10,
          y + cardH - 29,
          11,
          true,
          kpi.status === 'MISSING_DATA' ? [0.549, 0.322, 0.086] : [0.094, 0.114, 0.106],
        );
        if (kpi.subtext) {
          const sub = wrapText(kpi.subtext, 44)[0] ?? '';
          drawText(sub, x + 10, y + 8, 7.5, false, [0.361, 0.412, 0.392]);
        }
      }
      cursorY -= cardH + 8;
    }
  }

  // --- 3. Core Performance Breakdown Tables ---
  if (brief.tables.length > 0) {
    drawSectionHeading('Core Performance Breakdown', 'Verified Ledger');
    for (const table of brief.tables) {
      ensureSpace(44);
      drawText(table.title, MARGIN_X, cursorY, 10, true, [0.094, 0.114, 0.106]);
      cursorY -= 14;

      const colCount = table.columns.length;
      const firstColW = colCount <= 2 ? CONTENT_W * 0.62 : CONTENT_W * 0.36;
      const otherColW = (CONTENT_W - firstColW) / Math.max(1, colCount - 1);

      const getColX = (idx: number) =>
        idx === 0 ? MARGIN_X + 8 : MARGIN_X + firstColW + (idx - 1) * otherColW;

      // Table Header
      drawRect(MARGIN_X, cursorY - 6, CONTENT_W, 18, [0.929, 0.91, 0.867]);
      table.columns.forEach((col, idx) => {
        if (col.align === 'right') {
          const rightEdge =
            idx === 0 ? MARGIN_X + firstColW - 8 : MARGIN_X + firstColW + idx * otherColW - 8;
          drawRightText(col.label, rightEdge, cursorY, 8, true, [0.235, 0.278, 0.263]);
        } else {
          drawText(col.label, getColX(idx), cursorY, 8, true, [0.235, 0.278, 0.263]);
        }
      });
      cursorY -= 18;

      for (const row of table.rows) {
        ensureSpace(18);
        if (row.isTotal) {
          drawRect(MARGIN_X, cursorY - 5, CONTENT_W, 16, [0.965, 0.953, 0.925]);
        }
        const rowRgb: [number, number, number] =
          row.tone === 'danger'
            ? [0.573, 0.169, 0.129]
            : row.tone === 'warning'
              ? [0.549, 0.322, 0.086]
              : row.tone === 'positive'
                ? [0.078, 0.325, 0.235]
                : [0.094, 0.114, 0.106];

        row.cells.forEach((cell, idx) => {
          const colDef = table.columns[idx];
          const truncated = cell.length > 36 && idx === 0 ? `${cell.slice(0, 33)}...` : cell;
          if (colDef?.align === 'right') {
            const rightEdge =
              idx === 0 ? MARGIN_X + firstColW - 8 : MARGIN_X + firstColW + idx * otherColW - 8;
            drawRightText(truncated, rightEdge, cursorY, 8.5, Boolean(row.isTotal), rowRgb);
          } else {
            drawText(truncated, getColX(idx), cursorY, 8.5, Boolean(row.isTotal), rowRgb);
          }
        });
        drawLine(MARGIN_X, cursorY - 5, PAGE_W - MARGIN_X, cursorY - 5, [0.89, 0.87, 0.82], 0.4);
        cursorY -= 16;
      }

      if (table.note) {
        ensureSpace(14);
        drawText(table.note, MARGIN_X, cursorY, 7.5, false, [0.361, 0.412, 0.392]);
        cursorY -= 12;
      }
      cursorY -= 8;
    }
  }

  // --- 4. Key Risks & Anomalies (only when actual issues exist) ---
  if (brief.risksAndAnomalies.length > 0) {
    drawSectionHeading('Key Risks & Anomalies', 'Detected Signals');
    for (const risk of brief.risksAndAnomalies) {
      const detailLines = wrapText(risk.detail, 84);
      ensureSpace(detailLines.length * 12 + 18);
      const sevRgb: [number, number, number] =
        risk.severity === 'CRITICAL' || risk.severity === 'HIGH'
          ? [0.573, 0.169, 0.129]
          : [0.549, 0.322, 0.086];
      drawText(`[${risk.severity}]`, MARGIN_X, cursorY, 8.5, true, sevRgb);
      drawText(`${risk.title} (${risk.sourceTag})`, MARGIN_X + 62, cursorY, 9, true, [0.094, 0.114, 0.106]);
      cursorY -= 13;
      for (const line of detailLines) {
        drawText(line, MARGIN_X + 12, cursorY, 8.5, false, [0.235, 0.278, 0.263]);
        cursorY -= 11.5;
      }
      cursorY -= 4;
    }
  }

  // --- 5. Prioritized Action Plan (explicitly badged AI Advisory) ---
  if (brief.prioritizedActionPlan.length > 0) {
    drawSectionHeading('Prioritized Action Plan', 'AI Advisory');
    for (const act of brief.prioritizedActionPlan) {
      const rationaleLines = wrapText(act.rationale, 84);
      ensureSpace(rationaleLines.length * 12 + 18);
      drawText(`P${act.priority} [${act.impact}]`, MARGIN_X, cursorY, 8.5, true, [0.086, 0.22, 0.173]);
      drawText(`${act.title} - ${act.targetArea}`, MARGIN_X + 58, cursorY, 9, true, [0.094, 0.114, 0.106]);
      cursorY -= 13;
      for (const line of rationaleLines) {
        drawText(line, MARGIN_X + 12, cursorY, 8.5, false, [0.235, 0.278, 0.263]);
        cursorY -= 11.5;
      }
      cursorY -= 4;
    }
  }

  // --- 6. Data Grounding & Limitations ---
  drawSectionHeading('Data Grounding & Limitations', 'Audit Trail');
  const rc = brief.dataGrounding.recordCounts;
  const countsText =
    `Records Evaluated: ${rc.accounts} accounts | ${rc.transactions} transactions | ${rc.invoices} invoices | ${rc.bills} bills | ${rc.budgets} budgets | ${rc.riskAlerts} risk alerts`;
  for (const line of wrapText(countsText, 94)) {
    ensureSpace(14);
    drawText(line, MARGIN_X, cursorY, 8, true, [0.235, 0.278, 0.263]);
    cursorY -= 12;
  }
  if (brief.dataGrounding.dataSources.length > 0) {
    for (const line of wrapText(`Sources: ${brief.dataGrounding.dataSources.join(', ')}`, 94)) {
      ensureSpace(13);
      drawText(line, MARGIN_X, cursorY, 8, false, [0.361, 0.412, 0.392]);
      cursorY -= 11.5;
    }
  }
  if (brief.dataGrounding.missingInputs.length > 0) {
    for (const lim of brief.dataGrounding.missingInputs) {
      for (const line of wrapText(`Limitation: ${lim}`, 92)) {
        ensureSpace(13);
        drawText(line, MARGIN_X, cursorY, 8, false, [0.549, 0.322, 0.086]);
        cursorY -= 11.5;
      }
    }
  }
  for (const line of wrapText(brief.dataGrounding.methodologyNote, 94)) {
    ensureSpace(13);
    drawText(line, MARGIN_X, cursorY, 7.5, false, [0.361, 0.412, 0.392]);
    cursorY -= 11;
  }

  // --- Add Footers & Page Numbers ---
  const totalPages = pages.length;
  pages.forEach((cmds, idx) => {
    const footerY = 26;
    cmds.push(
      `0.855 0.827 0.765 RG 0.5 w ${MARGIN_X.toFixed(2)} ${(footerY + 10).toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${(footerY + 10).toFixed(2)} l S`,
    );
    cmds.push(
      `BT /F1 7.5 Tf 0.361 0.412 0.392 rg ${MARGIN_X.toFixed(2)} ${footerY.toFixed(2)} Td (${escapePdfString(`Report ID: ${report.id}  |  Confidential Executive Financial Brief`)}) Tj ET`,
    );
    const pgLabel = `Page ${idx + 1} of ${totalPages}`;
    const pgW = approxTextWidth(pgLabel, 7.5, false);
    cmds.push(
      `BT /F1 7.5 Tf 0.361 0.412 0.392 rg ${(PAGE_W - MARGIN_X - pgW).toFixed(2)} ${footerY.toFixed(2)} Td (${pgLabel}) Tj ET`,
    );
  });

  // --- Assemble PDF 1.4 Byte Stream ---
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogObjId = addObj(''); // placeholder 1
  const pagesObjId = addObj('');   // placeholder 2
  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageObjIds: number[] = [];
  for (const pageCmds of pages) {
    const streamData = pageCmds.join('\n');
    const contentId = addObj(
      `<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`,
    );
    const pId = addObj(
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageObjIds.push(pId);
  }

  objects[catalogObjId - 1] = `<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`;
  objects[pagesObjId - 1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;

  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let byteLen = '%PDF-1.4\n'.length;

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(byteLen);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(objStr);
    byteLen += objStr.length;
  }

  const xrefOffset = byteLen;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (let i = 1; i <= objects.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new TextEncoder().encode(chunks.join(''));
}
