const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number | null | undefined;

/**
 * CSV metni (RFC 4180): virgül/tırnak/satır sonu içeren hücreler tırnaklanır. Formül enjeksiyonuna karşı
 * `=`, `+`, `-`, `@` ile başlayan metinlerin önüne kesme işareti konur (sayılar etkilenmez).
 * Excel'in UTF-8'i tanıması için başa BOM eklenir.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvCell>>): string {
  const cell = (value: CsvCell): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${BOM}${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
