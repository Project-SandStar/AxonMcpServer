import { HDict, HGrid, HMarker, HNum, HRef, HStr } from 'haystack-core';
import { csvField, gridToCsv } from '../skyspark/gridCsv';

describe('csvField', () => {
  it('leaves plain text alone', () => {
    expect(csvField('Calinos_HQ')).toBe('Calinos_HQ');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('Beykoz, Istanbul')).toBe('"Beykoz, Istanbul"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });
});

describe('gridToCsv', () => {
  const grid = HGrid.make({
    rows: [
      HDict.make({
        id: HRef.make('p:x:r:1', 'HQ'),
        dis: HStr.make('Beykoz, Istanbul'),
        yearBuilt: HNum.make(2010),
        area: HNum.make(72.5, '°F'),
        site: HMarker.make(),
      }),
    ],
  });

  it('keeps one field per column', () => {
    const [header, line] = gridToCsv(grid).split('\n');
    expect(header.split(',')).toHaveLength(5);
    expect(line).toContain('"Beykoz, Istanbul"');
    expect(line).toContain('"@p:x:r:1 ""HQ"""');
  });

  it('writes numbers without thousands separators', () => {
    const line = gridToCsv(grid).split('\n')[1];
    expect(line).toContain(',2010,');
    expect(line).toContain('72.5°F');
  });

  it('writes empty cells for missing values', () => {
    const g = HGrid.make({
      columns: [{ name: 'a' }, { name: 'b' }],
      rows: [HDict.make({ a: HStr.make('x') })],
    });
    expect(gridToCsv(g)).toBe('a,b\nx,');
  });
});
