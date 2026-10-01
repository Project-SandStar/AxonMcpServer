import { HGrid, HNum, HVal, Kind, valueIsKind } from 'haystack-core';

/** Quote a CSV field (RFC 4180) when it holds a comma, quote or line break. */
export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Text for one cell. Numbers use zinc form ("2010", "72.5°F"), not locale form ("2,010"). */
export function csvCell(val: HVal | undefined | null): string {
  if (val === undefined || val === null) return '';
  if (valueIsKind<HNum>(val, Kind.Number)) return val.toZinc();
  return val.toString();
}

/** Encode a grid as CSV: a header row of column names, then one line per row. */
export function gridToCsv(grid: HGrid): string {
  const headers = grid.getColumnNames();
  const lines = grid.getRows().map(row =>
    headers.map(h => csvField(csvCell(row.get(h)))).join(',')
  );
  return [headers.map(csvField).join(','), ...lines].join('\n');
}
