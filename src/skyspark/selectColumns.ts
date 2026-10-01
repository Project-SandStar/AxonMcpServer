import { HDict, HGrid } from 'haystack-core';

/**
 * Resolve which columns to output. `select` may be an array of names or a
 * comma-separated string. Order follows `select`; duplicates and blanks are
 * dropped. Names not in `available` are kept (they come out as null/empty).
 * An empty or absent `select` returns all available columns.
 */
export function resolveSelectedColumns(available: string[], select?: unknown): string[] {
  const requested = Array.isArray(select)
    ? select.map(s => String(s))
    : typeof select === 'string'
      ? select.split(',')
      : [];
  const names = [...new Set(requested.map(s => s.trim()).filter(s => s.length > 0))];
  return names.length > 0 ? names : available;
}

/**
 * Return a new grid with at most `limit` rows and only the selected columns,
 * in `select` order. Grid and column meta are kept.
 */
export function selectGridColumns(grid: HGrid, select?: unknown, limit?: number): HGrid {
  const names = resolveSelectedColumns(grid.getColumnNames(), select);
  const rows = grid.getRows().slice(0, limit ?? undefined);
  return HGrid.make({
    meta: grid.meta,
    columns: names.map(name => ({ name, meta: grid.getColumn(name)?.meta })),
    rows: rows.map(row => {
      const out: Record<string, any> = {};
      for (const name of names) {
        const val = row.get(name);
        if (val !== undefined && val !== null) out[name] = val;
      }
      return HDict.make(out);
    }),
  });
}
