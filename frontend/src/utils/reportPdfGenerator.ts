import type { ExecutiveBrief, ReportRecord } from '../types/reports.types';
import { formatReportText } from './formatters';
import {
  getReportDataSources,
  getReportRecordCounts,
  getRiskSeverityCounts,
  getSourceReferenceLabel,
  formatSourceReferenceValues,
  normalizeExecutiveBrief,
} from './reportBriefAdapter';

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
  return sanitizePdfText(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let offset = 0; offset < word.length; offset += maxChars) {
        const part = word.slice(offset, offset + maxChars);
        if (part.length === maxChars) lines.push(part);
        else current = part;
      }
      continue;
    }
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
  brief = normalizeExecutiveBrief(brief);
  const PAGE_W = 595.28; // A4 width in pt
  const PAGE_H = 841.89; // A4 height in pt
  const MARGIN_X = 48;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const TOP_Y = PAGE_H - 52;
  const BOTTOM_Y = 54;
  const INK: [number, number, number] = [0.12, 0.1, 0.18];
  const BODY: [number, number, number] = [0.28, 0.27, 0.33];
  const MUTED: [number, number, number] = [0.43, 0.41, 0.48];
  const PURPLE: [number, number, number] = [0.31, 0.22, 0.52];
  const BORDER: [number, number, number] = [0.86, 0.84, 0.89];
  const SURFACE: [number, number, number] = [0.97, 0.96, 0.98];
  const PALE_PURPLE: [number, number, number] = [0.94, 0.92, 0.97];
  const DANGER: [number, number, number] = [0.62, 0.2, 0.24];
  const WARNING: [number, number, number] = [0.58, 0.39, 0.12];
  const POSITIVE: [number, number, number] = [0.15, 0.4, 0.31];

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
    rgb: [number, number, number] = INK,
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
    rgb: [number, number, number] = INK,
  ) => {
    const w = approxTextWidth(text, size, bold);
    drawText(text, Math.max(MARGIN_X, rightX - w), y, size, bold, rgb);
  };

  const drawCenteredText = (
    text: string,
    centerX: number,
    y: number,
    size: number,
    bold = false,
    rgb: [number, number, number] = INK,
  ) => {
    const w = approxTextWidth(text, size, bold);
    drawText(text, centerX - w / 2, y, size, bold, rgb);
  };

  const maxCharsForWidth = (width: number, size: number, bold = false) =>
    Math.max(5, Math.floor(width / (size * (bold ? 0.54 : 0.5)) - 1));

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
    rgb: [number, number, number] = BORDER,
    width = 0.6,
  ) => {
    emit(
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  };

  const startContinuationPage = () => {
    pages.push([]);
    pageIndex += 1;
    cursorY = TOP_Y;
    const organizationLines = wrapText(
      organizationName,
      maxCharsForWidth(CONTENT_W * 0.56, 8.5, true),
    );
    organizationLines.forEach((line, idx) =>
      drawText(line, MARGIN_X, cursorY - 12 - idx * 10, 8.5, true, PURPLE),
    );
    drawRightText(`Report ${report.id}`, PAGE_W - MARGIN_X, cursorY - 12, 8, false, MUTED);
    cursorY -= organizationLines.length * 10 + 3;
    drawLine(MARGIN_X, cursorY, PAGE_W - MARGIN_X, cursorY, BORDER, 0.7);
    cursorY -= 18;
  };

  const ensureSpace = (neededPt: number) => {
    if (cursorY - neededPt < BOTTOM_Y) {
      startContinuationPage();
    }
  };

  const drawSectionHeading = (title: string, followingContent = 20) => {
    ensureSpace(34 + followingContent);
    cursorY -= 7;
    drawText(title, MARGIN_X, cursorY, 11, true, PURPLE);
    cursorY -= 7;
    drawLine(MARGIN_X, cursorY, PAGE_W - MARGIN_X, cursorY, BORDER, 0.7);
    cursorY -= 15;
  };

  // --- Document Header ---
  const titleLines = wrapText(
    formatReportText(report.title, brief.dataGrounding.currency),
    maxCharsForWidth(CONTENT_W - 28, 14, true),
  );
  const organizationLines = wrapText(
    organizationName,
    maxCharsForWidth(CONTENT_W * 0.56, 8.5, true),
  );
  const titleStartY = cursorY - 15 - organizationLines.length * 10 - 6;
  const headerBottom = titleStartY - titleLines.length * 15 - 14;
  const headerHeight = cursorY - headerBottom;
  drawRect(MARGIN_X, headerBottom, CONTENT_W, headerHeight, SURFACE, BORDER);
  drawRect(MARGIN_X, headerBottom, 4, headerHeight, PURPLE);
  organizationLines.forEach((line, idx) =>
    drawText(line, MARGIN_X + 14, cursorY - 15 - idx * 10, 8.5, true, PURPLE),
  );
  const reportTypeLabel = brief.reportType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  drawRightText(
    `${reportTypeLabel}  |  ${brief.dataGrounding.currency}`,
    PAGE_W - MARGIN_X - 12,
    cursorY - 15,
    8,
    true,
    PURPLE,
  );
  let titleY = titleStartY;
  for (const tl of titleLines) {
    drawText(tl, MARGIN_X + 14, titleY, 14, true, INK);
    titleY -= 15;
  }
  drawText(
    `Period: ${shortDate(brief.dataGrounding.reportingPeriodStart)} to ${shortDate(brief.dataGrounding.reportingPeriodEnd)}  |  Prepared: ${shortDate(report.createdAt)}`,
    MARGIN_X + 14,
    headerBottom + 10,
    8.5,
    false,
    MUTED,
  );
  cursorY = headerBottom - 17;

  // --- 1. Executive Summary ---
  if (brief.executiveSummary.length > 0) {
    drawSectionHeading('Executive summary');
    for (const sentence of brief.executiveSummary) {
      const lines = wrapText(sentence, maxCharsForWidth(CONTENT_W, 9.5));
      for (const line of lines) {
        ensureSpace(14);
        drawText(line, MARGIN_X, cursorY, 9.5, false, BODY);
        cursorY -= 14;
      }
      cursorY -= 2;
    }
  }

  // --- 2. Financial Indicators ---
  if (brief.kpis.length > 0) {
    drawSectionHeading('Financial indicators', 66);
    const colGap = 10;
    const cardW = (CONTENT_W - colGap) / 2;
    for (let i = 0; i < brief.kpis.length; i += 2) {
      const pair = [brief.kpis[i], brief.kpis[i + 1]].filter(
        (kpi): kpi is (typeof brief.kpis)[number] => Boolean(kpi),
      );
      const cardLines = pair.map((kpi) => ({
        label: wrapText(kpi.label, maxCharsForWidth(cardW - 20, 7.5, true)),
        value: wrapText(
          kpi.secondaryValue
            ? `${kpi.value}  |  ${kpi.secondaryLabel ?? ''} ${kpi.secondaryValue}`
            : kpi.value,
          maxCharsForWidth(cardW - 20, 10.5, true),
        ),
        subtext: kpi.subtext ? wrapText(kpi.subtext, maxCharsForWidth(cardW - 20, 7.5)) : [],
      }));
      const cardH = Math.max(
        58,
        ...cardLines.map(
          ({ label, value, subtext }) =>
            15 + label.length * 9 + value.length * 13 + subtext.length * 9 + 7,
        ),
      );
      ensureSpace(cardH + 8);
      for (let col = 0; col < 2; col += 1) {
        const kpi = brief.kpis[i + col];
        if (!kpi) continue;
        const x = MARGIN_X + col * (cardW + colGap);
        const cardY = cursorY - cardH;
        drawRect(x, cardY, cardW, cardH, SURFACE, BORDER);
        let textY = cursorY - 14;
        const content = cardLines[col];
        for (const line of content.label) {
          drawText(line, x + 10, textY, 7.5, true, MUTED);
          textY -= 9;
        }
        for (const line of content.value) {
          drawText(
            line,
            x + 10,
            textY - 1,
            10.5,
            true,
            kpi.status === 'MISSING_DATA' ? WARNING : INK,
          );
          textY -= 13;
        }
        for (const line of content.subtext) {
          drawText(line, x + 10, textY - 1, 7.5, false, MUTED);
          textY -= 9;
        }
      }
      cursorY -= cardH + 8;
    }
  }

  // --- 3. Performance Detail ---
  if (brief.tables.length > 0) {
    drawSectionHeading('Performance detail', 56);
    for (const table of brief.tables) {
      const colCount = table.columns.length;
      const firstColW = colCount <= 2 ? CONTENT_W * 0.62 : CONTENT_W * 0.36;
      const otherColW = (CONTENT_W - firstColW) / Math.max(1, colCount - 1);
      const colWidths = table.columns.map((_, idx) => (idx === 0 ? firstColW : otherColW));
      const getColX = (idx: number) =>
        MARGIN_X + colWidths.slice(0, idx).reduce((sum, width) => sum + width, 0);
      const getColRight = (idx: number) => getColX(idx) + (colWidths[idx] ?? 0) - 8;

      const drawTableHeader = (continued = false) => {
        const titleLines = wrapText(
          `${table.title}${continued ? ' (continued)' : ''}`,
          maxCharsForWidth(CONTENT_W, 10, true),
        );
        const headerLines = table.columns.map((col, idx) =>
          wrapText(col.label, maxCharsForWidth((colWidths[idx] ?? 0) - 14, 7.5, true)),
        );
        const headerHeight = Math.max(21, ...headerLines.map((lines) => lines.length * 9 + 8));
        ensureSpace(titleLines.length * 12 + headerHeight + 12);
        for (const line of titleLines) {
          drawText(line, MARGIN_X, cursorY, 10, true, INK);
          cursorY -= 12;
        }
        cursorY -= 2;
        drawRect(MARGIN_X, cursorY - headerHeight + 6, CONTENT_W, headerHeight, PALE_PURPLE);
        table.columns.forEach((col, idx) => {
          const x = getColX(idx);
          const lines = headerLines[idx] ?? [];
          lines.forEach((line, lineIdx) => {
            const baseline = cursorY - 7 - lineIdx * 9;
            if (col.align === 'right') {
              drawRightText(line, getColRight(idx), baseline, 7.5, true, BODY);
            } else if (col.align === 'center') {
              drawCenteredText(line, x + (colWidths[idx] ?? 0) / 2, baseline, 7.5, true, BODY);
            } else {
              drawText(line, x + 7, baseline, 7.5, true, BODY);
            }
          });
        });
        cursorY -= headerHeight + 1;
      };

      drawTableHeader();

      for (const row of table.rows) {
        const rowRgb: [number, number, number] =
          row.tone === 'danger'
            ? DANGER
            : row.tone === 'warning'
              ? WARNING
              : row.tone === 'positive'
                ? POSITIVE
                : INK;
        const cellLines = table.columns.map((_, idx) =>
          wrapText(
            row.cells[idx] ?? '',
            maxCharsForWidth((colWidths[idx] ?? 0) - 14, 8.5, Boolean(row.isTotal)),
          ),
        );
        const lineCount = Math.max(1, ...cellLines.map((lines) => lines.length));
        let lineOffset = 0;

        while (lineOffset < lineCount) {
          let availableLines = Math.floor((cursorY - BOTTOM_Y - 8) / 10);
          if (availableLines < 1) {
            startContinuationPage();
            drawTableHeader(true);
            availableLines = Math.floor((cursorY - BOTTOM_Y - 8) / 10);
          }
          if (availableLines < 2 && lineCount - lineOffset > availableLines) {
            startContinuationPage();
            drawTableHeader(true);
            continue;
          }

          const fragmentLines = Math.min(lineCount - lineOffset, availableLines);
          const fragmentHeight = fragmentLines * 10 + 8;
          if (row.isTotal) {
            drawRect(MARGIN_X, cursorY - fragmentHeight + 2, CONTENT_W, fragmentHeight, SURFACE);
          }

          table.columns.forEach((col, idx) => {
            const lines = cellLines[idx] ?? [];
            for (let lineIdx = lineOffset; lineIdx < lineOffset + fragmentLines; lineIdx += 1) {
              const text = lines[lineIdx];
              if (!text) continue;
              const baseline = cursorY - 5 - (lineIdx - lineOffset) * 10;
              if (col.align === 'right') {
                drawRightText(text, getColRight(idx), baseline, 8.5, Boolean(row.isTotal), rowRgb);
              } else if (col.align === 'center') {
                drawCenteredText(
                  text,
                  getColX(idx) + (colWidths[idx] ?? 0) / 2,
                  baseline,
                  8.5,
                  Boolean(row.isTotal),
                  rowRgb,
                );
              } else {
                drawText(text, getColX(idx) + 7, baseline, 8.5, Boolean(row.isTotal), rowRgb);
              }
            }
          });
          cursorY -= fragmentHeight;
          drawLine(MARGIN_X, cursorY + 2, PAGE_W - MARGIN_X, cursorY + 2, BORDER, 0.4);
          lineOffset += fragmentLines;

          if (lineOffset < lineCount) {
            startContinuationPage();
            drawTableHeader(true);
          }
        }
      }

      if (table.note) {
        for (const line of wrapText(table.note, maxCharsForWidth(CONTENT_W, 8))) {
          ensureSpace(12);
          drawText(line, MARGIN_X, cursorY, 8, false, MUTED);
          cursorY -= 11;
        }
      }
      cursorY -= 9;
    }
  }

  // --- 4. Risk Observations ---
  if (brief.risksAndAnomalies.length > 0) {
    drawSectionHeading('Risk observations', 82);
    const hasRiskDistributionTable = brief.tables.some((table) =>
      table.title.toLowerCase().includes('alert distribution by severity'),
    );
    if (!hasRiskDistributionTable) {
      drawText('Severity profile', MARGIN_X, cursorY, 9.5, true, INK);
      cursorY -= 14;
      const severityCounts = getRiskSeverityCounts(brief.risksAndAnomalies);
      const maxSeverityCount = Math.max(1, ...severityCounts.map(({ count }) => count));
      for (const { severity, count } of severityCounts) {
        ensureSpace(16);
        const tone =
          severity === 'CRITICAL' || severity === 'HIGH'
            ? DANGER
            : severity === 'MEDIUM'
              ? WARNING
              : POSITIVE;
        drawText(severity, MARGIN_X, cursorY, 8, true, BODY);
        drawRect(MARGIN_X + 94, cursorY - 2, 330, 7, SURFACE);
        drawRect(MARGIN_X + 94, cursorY - 2, (330 * count) / maxSeverityCount, 7, tone);
        drawRightText(String(count), PAGE_W - MARGIN_X, cursorY, 8.5, true, INK);
        cursorY -= 15;
      }
      cursorY -= 7;
    }

    for (const risk of brief.risksAndAnomalies) {
      const titleLines = wrapText(
        `${risk.severity}  |  ${risk.title}`,
        maxCharsForWidth(CONTENT_W - 12, 9.5, true),
      );
      const sourceLines = wrapText(
        `Source: ${risk.sourceTag}`,
        maxCharsForWidth(CONTENT_W - 12, 8),
      );
      const detailLines = wrapText(risk.detail, maxCharsForWidth(CONTENT_W - 12, 8.5));
      ensureSpace(31);
      const sevRgb: [number, number, number] =
        risk.severity === 'CRITICAL' || risk.severity === 'HIGH'
          ? DANGER
          : risk.severity === 'MEDIUM'
            ? WARNING
            : POSITIVE;
      for (const line of titleLines) {
        ensureSpace(12);
        drawText(line, MARGIN_X, cursorY, 9.5, true, sevRgb);
        cursorY -= 12;
      }
      for (const line of sourceLines) {
        ensureSpace(10);
        drawText(line, MARGIN_X + 10, cursorY, 8, false, MUTED);
        cursorY -= 10;
      }
      for (const line of detailLines) {
        ensureSpace(12);
        drawText(line, MARGIN_X + 10, cursorY, 8.5, false, BODY);
        cursorY -= 12;
      }
      cursorY -= 7;
    }
  }

  // --- 5. Recommended Actions ---
  if (brief.prioritizedActionPlan.length > 0) {
    drawSectionHeading('Recommended actions', 42);
    for (const act of brief.prioritizedActionPlan) {
      const titleLines = wrapText(
        `P${act.priority}  |  ${act.title}`,
        maxCharsForWidth(CONTENT_W, 9.5, true),
      );
      const metaLines = wrapText(
        `${act.targetArea}  |  ${act.impact.toLowerCase()} impact`,
        maxCharsForWidth(CONTENT_W - 12, 8),
      );
      const rationaleLines = wrapText(act.rationale, maxCharsForWidth(CONTENT_W - 12, 8.5));
      ensureSpace(30);
      for (const line of titleLines) {
        ensureSpace(12);
        drawText(line, MARGIN_X, cursorY, 9.5, true, INK);
        cursorY -= 12;
      }
      for (const line of metaLines) {
        ensureSpace(10);
        drawText(line, MARGIN_X + 10, cursorY, 8, false, MUTED);
        cursorY -= 10;
      }
      for (const line of rationaleLines) {
        ensureSpace(12);
        drawText(line, MARGIN_X + 10, cursorY, 8.5, false, BODY);
        cursorY -= 12;
      }
      cursorY -= 7;
    }
  }

  // --- 6. Sources & Limitations ---
  const recordCounts = getReportRecordCounts(brief);
  const reportDataSources = getReportDataSources(brief);
  const sourceReferences = Object.entries(report.sourceRecordIds ?? {}).filter(
    ([, ids]) => Array.isArray(ids) && ids.length > 0,
  );
  const hasGrounding =
    recordCounts.length > 0 ||
    reportDataSources.length > 0 ||
    brief.dataGrounding.missingInputs.length > 0 ||
    Boolean(brief.dataGrounding.methodologyNote.trim()) ||
    sourceReferences.length > 0;

  if (hasGrounding) {
    drawSectionHeading('Sources & limitations', 40);
  }
  if (recordCounts.length > 0) {
    const countsText = `Records included: ${recordCounts.map(({ label, count }) => `${label}: ${count}`).join('  |  ')}`;
    for (const line of wrapText(countsText, maxCharsForWidth(CONTENT_W, 8.5, true))) {
      ensureSpace(13);
      drawText(line, MARGIN_X, cursorY, 8.5, true, BODY);
      cursorY -= 12;
    }
  }
  if (reportDataSources.length > 0) {
    for (const line of wrapText(
      `Sources: ${reportDataSources.join(', ')}`,
      maxCharsForWidth(CONTENT_W, 8),
    )) {
      ensureSpace(12);
      drawText(line, MARGIN_X, cursorY, 8, false, MUTED);
      cursorY -= 11;
    }
  }
  if (sourceReferences.length > 0) {
    for (const [key, ids] of sourceReferences) {
      const sourceLabel = getSourceReferenceLabel(key);
      for (const line of wrapText(
        `${sourceLabel}: ${formatSourceReferenceValues(key, ids).join(', ')}`,
        maxCharsForWidth(CONTENT_W, 8),
      )) {
        ensureSpace(12);
        drawText(line, MARGIN_X, cursorY, 8, false, MUTED);
        cursorY -= 11;
      }
    }
  }
  if (brief.dataGrounding.missingInputs.length > 0) {
    ensureSpace(14);
    drawText('Limitations', MARGIN_X, cursorY, 8.5, true, WARNING);
    cursorY -= 12;
    for (const limitation of brief.dataGrounding.missingInputs) {
      for (const line of wrapText(limitation, maxCharsForWidth(CONTENT_W - 10, 8))) {
        ensureSpace(12);
        drawText(line, MARGIN_X + 10, cursorY, 8, false, WARNING);
        cursorY -= 11;
      }
    }
  }
  for (const line of wrapText(
    brief.dataGrounding.methodologyNote,
    maxCharsForWidth(CONTENT_W, 8),
  )) {
    ensureSpace(12);
    drawText(line, MARGIN_X, cursorY, 8, false, MUTED);
    cursorY -= 11;
  }

  // --- Add Footers & Page Numbers ---
  const totalPages = pages.length;
  pages.forEach((cmds, idx) => {
    const footerY = 26;
    cmds.push(
      `${BORDER.map((value) => value.toFixed(3)).join(' ')} RG 0.5 w ${MARGIN_X.toFixed(2)} ${(footerY + 10).toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${(footerY + 10).toFixed(2)} l S`,
    );
    cmds.push(
      `BT /F1 7.5 Tf ${MUTED.map((value) => value.toFixed(3)).join(' ')} rg ${MARGIN_X.toFixed(2)} ${footerY.toFixed(2)} Td (${escapePdfString(`Report ID: ${report.id}`)}) Tj ET`,
    );
    const pgLabel = `Page ${idx + 1} of ${totalPages}`;
    const pgW = approxTextWidth(pgLabel, 7.5, false);
    cmds.push(
      `BT /F1 7.5 Tf ${MUTED.map((value) => value.toFixed(3)).join(' ')} rg ${(PAGE_W - MARGIN_X - pgW).toFixed(2)} ${footerY.toFixed(2)} Td (${pgLabel}) Tj ET`,
    );
  });

  // --- Assemble PDF 1.4 Byte Stream ---
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogObjId = addObj(''); // placeholder 1
  const pagesObjId = addObj(''); // placeholder 2
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
  objects[pagesObjId - 1] =
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;

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
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new TextEncoder().encode(chunks.join(''));
}
