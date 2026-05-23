import type { DayOfWeek, DayState } from '../types.js';

const DAY_OF_WEEK_JA: Record<DayOfWeek, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  if (!y || !m) return yearMonth;
  return `${y}/${m}`;
}

export function formatDate(yearMonth: string, date: number, dayOfWeek: DayOfWeek): string {
  const [y, m] = yearMonth.split('-');
  if (!y || !m) return `${date}`;
  return `${y}/${m}/${String(date).padStart(2, '0')} (${DAY_OF_WEEK_JA[dayOfWeek]})`;
}

export function formatPrice(jpy: number): string {
  return `${jpy.toLocaleString('ja-JP')}円`;
}

export function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DayStateLabel = {
  symbol: string;
  symbolColor: string;
  bgColor: string;
  description: string;
  priceJpy?: number;
};

export function dayStateLabel(state: DayState): DayStateLabel {
  switch (state.kind) {
    case 'available':
      return {
        symbol: '○',
        symbolColor: '#2e7d32',
        bgColor: '#ffffff',
        description: '空きあり',
        priceJpy: state.priceJpy,
      };
    case 'limited':
      return {
        symbol: `残${state.remaining}`,
        symbolColor: '#e65100',
        bgColor: '#fff8e1',
        description: `残り${state.remaining}部屋`,
        priceJpy: state.priceJpy,
      };
    case 'full':
      return {
        symbol: '×',
        symbolColor: '#c62828',
        bgColor: '#fafafa',
        description: '満室',
      };
    case 'out_of_period':
      return {
        symbol: '—',
        symbolColor: '#9e9e9e',
        bgColor: '#f5f5f5',
        description: '受付外',
      };
  }
}

/** 「空きあり (available + limited)」 とみなす状態か？ */
export function isAvailableForReport(state: DayState): boolean {
  return state.kind === 'available' || state.kind === 'limited';
}

/** 検索条件サマリーの文字列化 */
export function formatSearchSummary(
  search: { adults: number; children: { age: string }[]; rooms: number; nights: number },
): string {
  const c = search.children.length;
  return `大人${search.adults}名 / 子ども${c}名 / ${search.nights}泊 / ${search.rooms}部屋`;
}
