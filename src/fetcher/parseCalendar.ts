import { parseHTML } from 'linkedom';
import type { CalendarMonth, DayOfWeek, DayState } from '../types.js';

const DAY_OF_WEEK_ORDER: readonly DayOfWeek[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export class CalendarParseError extends Error {
  constructor(
    message: string,
    public readonly htmlSnippet: string,
  ) {
    super(message);
    this.name = 'CalendarParseError';
  }
}

/**
 * `table.vacancyCalTable` の outerHTML 文字列をパースして CalendarMonth を返す
 * @param tableHtml `<table class="vacancyCalTable">...</table>` の文字列
 * @param monthValue TDR の月セレクタの value (例: "2026,6")
 */
export function parseCalendar(tableHtml: string, monthValue: string): CalendarMonth {
  const [yearStr, monthStr] = monthValue.split(',');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new CalendarParseError(`Invalid monthValue: ${monthValue}`, tableHtml.slice(0, 200));
  }

  const { document } = parseHTML(`<!doctype html><html><body>${tableHtml}</body></html>`);
  const days: CalendarMonth['days'] = [];

  document.querySelectorAll('td').forEach((td) => {
    const className = td.className ?? '';
    const match = className.match(/cal_(\d{4})(\d{2})(\d{2})/);
    if (!match) return; // パディングセル (cal_YYYYMMDD なし)

    const dateNum = Number(match[3]);
    const dayOfWeek = dayOfWeekFromTdClass(className);
    const state = parseDayState(td, td.outerHTML);

    days.push({ date: dateNum, dayOfWeek, state });
  });

  return {
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
    days,
  };
}

function dayOfWeekFromTdClass(className: string): DayOfWeek {
  const m = className.match(/\btd_(\d)\b/);
  if (!m) {
    throw new CalendarParseError(
      `td_X class not found in: ${className}`,
      className,
    );
  }
  const idx = Number(m[1]);
  const day = DAY_OF_WEEK_ORDER[idx];
  if (!day) {
    throw new CalendarParseError(`td_${idx} out of range 0-6`, className);
  }
  return day;
}

function parseDayState(td: Element, outerHTML: string): DayState {
  const className = td.className ?? '';
  // 受付外 (outsideSaleDays クラス)
  if (className.includes('outsideSaleDays')) {
    return { kind: 'out_of_period' };
  }

  const dd = td.querySelector('dd.calendarImage');
  if (!dd) {
    throw new CalendarParseError('dd.calendarImage not found', outerHTML.slice(0, 300));
  }

  const ddClassName = dd.className ?? '';

  // 残少 (few)
  if (ddClassName.split(/\s+/).includes('few')) {
    const remaining = parseRemaining(dd, outerHTML);
    const priceJpy = parsePrice(dd, outerHTML);
    return { kind: 'limited', remaining, priceJpy };
  }

  // 画像ベース判定 (available / full)
  const img = dd.querySelector('img');
  const src = img?.getAttribute('src') ?? '';
  if (src.includes('state_13')) {
    const priceJpy = parsePrice(dd, outerHTML);
    return { kind: 'available', priceJpy };
  }
  if (src.includes('state_14')) {
    return { kind: 'full' };
  }

  // スピナー (ico_spinner.gif) が残っている → fetcher 側の待機が不十分
  if (src.includes('spinner')) {
    throw new CalendarParseError(
      `Calendar cell still showing loading spinner — fetcher should have waited longer for AJAX to complete`,
      outerHTML.slice(0, 300),
    );
  }

  // vMiddle はサイトのバリエーションで様々な意味を持つ。
  // - vMiddle + outsideSaleDays td → out_of_period (上の分岐で処理済み)
  // - vMiddle + state_14 img → full (上の分岐で処理済み)
  // - vMiddle + img なし or 未知 img → out_of_period 扱い (「-」表示等)
  if (ddClassName.split(/\s+/).includes('vMiddle')) {
    return { kind: 'out_of_period' };
  }

  // ここまで来たら本当に未知のパターン。throw して呼び出し側で握りつぶしてもらう。
  // (parser が情報を黙って捨てるよりは、上位で「この部屋は取得失敗」として記録する方が良い)
  throw new CalendarParseError(
    `Unknown cell state: className="${ddClassName}", img.src="${src}"`,
    outerHTML.slice(0, 400),
  );
}

function parseRemaining(dd: Element, outerHTML: string): number {
  const span = dd.querySelector('span');
  const text = span?.textContent?.trim() ?? '';
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) {
    throw new CalendarParseError(`Invalid remaining: "${text}"`, outerHTML.slice(0, 300));
  }
  return n;
}

function parsePrice(dd: Element, outerHTML: string): number {
  const em = dd.querySelector('em.minimumAmount');
  const text = em?.textContent?.trim() ?? '';
  const digits = text.replace(/[円,\s]/g, '');
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 0) {
    throw new CalendarParseError(`Invalid price: "${text}"`, outerHTML.slice(0, 300));
  }
  return n;
}
