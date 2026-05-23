import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CalendarParseError, parseCalendar } from '../src/fetcher/parseCalendar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => readFileSync(join(__dirname, 'fixtures', rel), 'utf-8');

function wrapInTable(cellHtml: string): string {
  return `<table class="vacancyCalTable"><tbody><tr>${cellHtml}</tr></tbody></table>`;
}

describe('parseCalendar - 個別セル状態', () => {
  it('available (○) を正しくパースする', () => {
    const html = wrapInTable(fixture('cells/available.html'));
    const result = parseCalendar(html, '2026,9');

    expect(result.yearMonth).toBe('2026-09');
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      date: 1,
      dayOfWeek: 'tue',
      state: { kind: 'available', priceJpy: 89000 },
    });
  });

  it('limited (残N) を正しくパースする', () => {
    const html = wrapInTable(fixture('cells/limited.html'));
    const result = parseCalendar(html, '2026,6');

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      date: 4,
      dayOfWeek: 'thu',
      state: { kind: 'limited', remaining: 1, priceJpy: 89000 },
    });
  });

  it('full (×) を正しくパースする', () => {
    const html = wrapInTable(fixture('cells/full.html'));
    const result = parseCalendar(html, '2026,6');

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      date: 2,
      dayOfWeek: 'tue',
      state: { kind: 'full' },
    });
  });

  it('out_of_period (-) を正しくパースする', () => {
    const html = wrapInTable(fixture('cells/out_of_period.html'));
    const result = parseCalendar(html, '2026,9');

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      date: 24,
      dayOfWeek: 'thu',
      state: { kind: 'out_of_period' },
    });
  });

  it('padding セル (cal_ クラスなし) はスキップする', () => {
    const html = wrapInTable(fixture('cells/padding.html'));
    const result = parseCalendar(html, '2026,6');

    expect(result.days).toHaveLength(0);
  });
});

describe('parseCalendar - 月全体', () => {
  it('2026/06 の DHM カピターノ・スーペリアルームをパースする', () => {
    const html = fixture('months/2026-06-DHM-capitano-superior.html');
    const result = parseCalendar(html, '2026,6');

    expect(result.yearMonth).toBe('2026-06');
    expect(result.days).toHaveLength(7);

    // 6/1 (月) limited 2
    expect(result.days[0]).toMatchObject({
      date: 1,
      dayOfWeek: 'mon',
      state: { kind: 'limited', remaining: 2, priceJpy: 89000 },
    });
    // 6/2 (火) full
    expect(result.days[1]).toMatchObject({ date: 2, dayOfWeek: 'tue', state: { kind: 'full' } });
    // 6/7 (日) limited 4
    expect(result.days[6]).toMatchObject({
      date: 7,
      dayOfWeek: 'sun',
      state: { kind: 'limited', remaining: 4, priceJpy: 89000 },
    });
  });
});

describe('parseCalendar - エラー', () => {
  it('monthValue が不正なら CalendarParseError', () => {
    expect(() => parseCalendar('<table></table>', 'not-a-month')).toThrow(CalendarParseError);
    expect(() => parseCalendar('<table></table>', '2026,13')).toThrow(CalendarParseError);
    expect(() => parseCalendar('<table></table>', '2026,0')).toThrow(CalendarParseError);
  });

  it('未知のセル状態は CalendarParseError', () => {
    const weird = wrapInTable(
      '<td class="td_0 cal_20260601"><dl><dt class="calendarDate">1</dt><dd class="calendarImage"><span>UNKNOWN</span></dd></dl></td>',
    );
    expect(() => parseCalendar(weird, '2026,6')).toThrow(CalendarParseError);
  });
});
