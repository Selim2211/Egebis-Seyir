import { type CsvCell, toCsv } from '@scrum/shared';
import { buildXlsx, type XlsxCell } from './xlsx';

/** Satırları CSV dosyası olarak indirtir (tarayıcıda, sunucuya gitmeden). */
export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<CsvCell>>): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Satırları Excel (.xlsx) dosyası olarak indirtir (tarayıcıda, sunucuya gitmeden). */
export function downloadXlsx(
  filename: string,
  rows: ReadonlyArray<ReadonlyArray<XlsxCell>>,
  sheetName?: string,
): void {
  const bytes = buildXlsx(rows, sheetName);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
