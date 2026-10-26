export interface CsvColumn<Row> {
  label: string;
  value: (row: Row) => unknown;
}

export function downloadCsv<Row>(filename: string, columns: readonly CsvColumn<Row>[], rows: readonly Row[]) {
  const escape = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const records = [
    columns.map(({ label }) => label),
    ...rows.map((row) => columns.map(({ value }) => value(row))),
  ];
  const content = records.map((record) => record.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}