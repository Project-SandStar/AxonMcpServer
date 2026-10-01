import { HDict, HGrid, HStr, HRef } from 'haystack-core';
import { resolveSelectedColumns, selectGridColumns } from '../skyspark/selectColumns';

describe('resolveSelectedColumns', () => {
  const available = ['id', 'dis', 'site', 'area'];

  it('returns all columns when select is absent or empty', () => {
    expect(resolveSelectedColumns(available)).toEqual(available);
    expect(resolveSelectedColumns(available, [])).toEqual(available);
    expect(resolveSelectedColumns(available, '')).toEqual(available);
    expect(resolveSelectedColumns(available, ['  '])).toEqual(available);
  });

  it('keeps select order, trims and drops duplicates', () => {
    expect(resolveSelectedColumns(available, ['dis', ' id', 'dis'])).toEqual(['dis', 'id']);
  });

  it('accepts a comma-separated string', () => {
    expect(resolveSelectedColumns(available, 'id, dis')).toEqual(['id', 'dis']);
  });

  it('keeps unknown columns', () => {
    expect(resolveSelectedColumns(available, ['id', 'nope'])).toEqual(['id', 'nope']);
  });
});

describe('selectGridColumns', () => {
  const grid = HGrid.make({
    rows: [
      HDict.make({ id: HRef.make('a'), dis: HStr.make('A'), site: HStr.make('m'), area: HStr.make('1') }),
      HDict.make({ id: HRef.make('b'), dis: HStr.make('B'), site: HStr.make('m'), area: HStr.make('2') }),
      HDict.make({ id: HRef.make('c'), dis: HStr.make('C'), site: HStr.make('m'), area: HStr.make('3') }),
    ],
  });

  it('restricts and orders columns and applies limit', () => {
    const out = selectGridColumns(grid, ['dis', 'id'], 2);
    expect(out.getColumnNames()).toEqual(['dis', 'id']);
    expect(out.getRows()).toHaveLength(2);
    expect(out.getRows()[0].keys.sort()).toEqual(['dis', 'id']);
    expect(out.toZinc()).not.toContain('site');
  });

  it('keeps all columns without select', () => {
    const out = selectGridColumns(grid, undefined, 100);
    expect(out.getColumnNames().sort()).toEqual(['area', 'dis', 'id', 'site']);
    expect(out.getRows()).toHaveLength(3);
  });

  it('outputs unknown columns as empty', () => {
    const out = selectGridColumns(grid, ['id', 'nope'], 1);
    expect(out.getColumnNames()).toEqual(['id', 'nope']);
    expect(out.getRows()[0].get('nope')).toBeUndefined();
  });
});
