import type {
  CalendarMonth,
  ClassifiedError,
  FullSnapshot,
  HotelSnapshot,
  RoomTypeSnapshot,
} from '../types.js';
import {
  dayStateLabel,
  formatDate,
  formatDateTime,
  formatPrice,
  formatSearchSummary,
  isAvailableForReport,
} from './helpers.js';

/**
 * フィルタ済みのレポート用中間構造
 * (available + limited のみ抽出)
 */
type ReportEntry = {
  yearMonth: string;
  date: number;
  dayOfWeek: import('../types.js').DayOfWeek;
  symbol: string;
  symbolColor: string;
  bgColor: string;
  description: string;
  priceJpy?: number;
};

type RoomTypeReport = {
  area: string;
  roomTypeName: string;
  entries: ReportEntry[];
  /** すべての月で error も entries も無いケース → "空きなし" 扱い */
  noAvailability: boolean;
  error?: ClassifiedError;
};

type HotelReport = {
  hotelCode: string;
  hotelName: string;
  rooms: RoomTypeReport[];
  emptyRooms: RoomTypeReport[]; // 全期間空きなしの部屋タイプ
  errorRooms: RoomTypeReport[]; // 取得エラーの部屋タイプ
  hotelError?: ClassifiedError;
};

export function render(snapshot: FullSnapshot): string {
  const reports = snapshot.hotels.map((h) => buildHotelReport(h));
  const totalHotels = reports.length;
  const hotelsWithAvailability = reports.filter((r) =>
    r.rooms.some((rt) => rt.entries.length > 0),
  ).length;
  const totalRoomTypes = reports.reduce((acc, r) => acc + r.rooms.length + r.emptyRooms.length + r.errorRooms.length, 0);
  const roomTypesWithAvail = reports.reduce(
    (acc, r) => acc + r.rooms.filter((rt) => rt.entries.length > 0).length,
    0,
  );

  return wrapDocument(`
    <table style="width:100%;max-width:760px;margin:0 auto;border-collapse:collapse;font-family:-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;font-size:14px;color:#212121;">
      ${renderHeader(snapshot, { totalHotels, hotelsWithAvailability, totalRoomTypes, roomTypesWithAvail })}
      ${reports.map((r) => renderHotel(r)).join('')}
      ${renderEmptyRooms(reports)}
      ${renderErrors(reports)}
      ${renderFooter(snapshot)}
    </table>
  `);
}

function wrapDocument(body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>TDRホテル空き状況レポート</title>
</head>
<body style="margin:0;padding:24px 12px;background:#fafafa;">
${body}
</body>
</html>`;
}

function renderHeader(
  snapshot: FullSnapshot,
  stats: {
    totalHotels: number;
    hotelsWithAvailability: number;
    totalRoomTypes: number;
    roomTypesWithAvail: number;
  },
): string {
  return `
    <tr><td style="padding:24px 16px 8px;">
      <div style="font-size:22px;font-weight:bold;color:#0d47a1;">🏰 TDRホテル空き状況レポート</div>
      <div style="margin-top:8px;color:#555;">
        取得日時: ${formatDateTime(snapshot.fetchedAt)}<br>
        検索条件: ${formatSearchSummary(snapshot.searchParams)}<br>
        表示可能期間: ${snapshot.visibleMonthRange.from} 〜 ${snapshot.visibleMonthRange.to}
      </div>
      <div style="margin-top:16px;padding:12px;background:#e3f2fd;border-radius:6px;color:#0d47a1;">
        📊 全${stats.totalHotels}ホテル中 ${stats.hotelsWithAvailability}ホテルに空きあり /
        全${stats.totalRoomTypes}部屋タイプ中 ${stats.roomTypesWithAvail}件に空きあり
      </div>
    </td></tr>
  `;
}

function buildHotelReport(h: HotelSnapshot): HotelReport {
  const rooms: RoomTypeReport[] = [];
  const emptyRooms: RoomTypeReport[] = [];
  const errorRooms: RoomTypeReport[] = [];

  for (const rt of h.roomTypes) {
    const r = buildRoomTypeReport(rt);
    if (r.error) {
      errorRooms.push(r);
    } else if (r.entries.length > 0) {
      rooms.push(r);
    } else {
      emptyRooms.push(r);
    }
  }

  return {
    hotelCode: h.hotelCode,
    hotelName: h.hotelName,
    rooms,
    emptyRooms,
    errorRooms,
    ...(h.error ? { hotelError: h.error } : {}),
  };
}

function buildRoomTypeReport(rt: RoomTypeSnapshot): RoomTypeReport {
  const entries: ReportEntry[] = [];
  for (const m of rt.months) {
    for (const d of m.days) {
      if (!isAvailableForReport(d.state)) continue;
      const label = dayStateLabel(d.state);
      entries.push({
        yearMonth: m.yearMonth,
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        symbol: label.symbol,
        symbolColor: label.symbolColor,
        bgColor: label.bgColor,
        description: label.description,
        ...(label.priceJpy !== undefined ? { priceJpy: label.priceJpy } : {}),
      });
    }
  }
  // 日付昇順に並べる
  entries.sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth) || a.date - b.date,
  );

  return {
    area: rt.area,
    roomTypeName: rt.roomTypeName,
    entries,
    noAvailability: entries.length === 0,
    ...(rt.error ? { error: rt.error } : {}),
  };
}

function renderHotel(r: HotelReport): string {
  if (r.hotelError) {
    return `
      <tr><td style="padding:24px 16px 0;">
        <div style="font-size:18px;font-weight:bold;border-bottom:2px solid #0d47a1;padding-bottom:6px;color:#0d47a1;">
          🏨 ${escapeHtml(r.hotelName)}
        </div>
        <div style="margin-top:12px;padding:10px;background:#ffebee;border-radius:6px;color:#b71c1c;">
          ⚠️ このホテルは取得に失敗しました: ${escapeHtml(r.hotelError.kind)} / ${escapeHtml(r.hotelError.message)}
        </div>
      </td></tr>
    `;
  }
  if (r.rooms.length === 0) {
    // 空きなしのみのホテルは見出しだけ簡素に
    return `
      <tr><td style="padding:24px 16px 0;">
        <div style="font-size:18px;font-weight:bold;border-bottom:2px solid #bdbdbd;padding-bottom:6px;color:#666;">
          🏨 ${escapeHtml(r.hotelName)}
        </div>
        <div style="margin-top:8px;color:#888;font-size:13px;">全部屋タイプ空きなし</div>
      </td></tr>
    `;
  }
  return `
    <tr><td style="padding:24px 16px 0;">
      <div style="font-size:18px;font-weight:bold;border-bottom:2px solid #0d47a1;padding-bottom:6px;color:#0d47a1;">
        🏨 ${escapeHtml(r.hotelName)}
      </div>
      ${r.rooms.map(renderRoomType).join('')}
    </td></tr>
  `;
}

function renderRoomType(rt: RoomTypeReport): string {
  return `
    <div style="margin-top:14px;">
      <div style="font-weight:bold;color:#333;">
        ▸ ${escapeHtml(rt.area)} ${escapeHtml(rt.roomTypeName)}
      </div>
      <table style="margin-top:6px;border-collapse:collapse;width:100%;">
        ${rt.entries.map(renderEntry).join('')}
      </table>
    </div>
  `;
}

function renderEntry(e: ReportEntry): string {
  const dateLabel = formatDate(e.yearMonth, e.date, e.dayOfWeek);
  const priceLabel = e.priceJpy !== undefined ? `${formatPrice(e.priceJpy)}〜` : '';
  return `
    <tr style="background:${e.bgColor};">
      <td style="padding:6px 12px;font-family:'Menlo','Consolas',monospace;color:#212121;width:180px;border-bottom:1px solid #eee;">${dateLabel}</td>
      <td style="padding:6px 12px;color:${e.symbolColor};font-weight:bold;width:80px;border-bottom:1px solid #eee;">${escapeHtml(e.symbol)}</td>
      <td style="padding:6px 12px;color:#444;border-bottom:1px solid #eee;">${escapeHtml(priceLabel)}</td>
    </tr>
  `;
}

function renderEmptyRooms(reports: HotelReport[]): string {
  const allEmpty = reports.flatMap((r) =>
    r.emptyRooms.map((rt) => `${r.hotelCode} ${rt.area} ${rt.roomTypeName}`),
  );
  if (allEmpty.length === 0) return '';
  return `
    <tr><td style="padding:24px 16px 0;">
      <div style="font-size:16px;font-weight:bold;color:#666;">📭 全期間空きなしの部屋タイプ (${allEmpty.length}件)</div>
      <ul style="margin:8px 0 0;padding-left:20px;color:#888;font-size:13px;line-height:1.7;">
        ${allEmpty.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </td></tr>
  `;
}

function renderErrors(reports: HotelReport[]): string {
  const errors: { label: string; err: ClassifiedError }[] = [];
  for (const r of reports) {
    if (r.hotelError) {
      errors.push({ label: `${r.hotelCode} (ホテル全体)`, err: r.hotelError });
    }
    for (const rt of r.errorRooms) {
      if (rt.error) {
        errors.push({
          label: `${r.hotelCode} ${rt.area} ${rt.roomTypeName}`,
          err: rt.error,
        });
      }
    }
  }
  if (errors.length === 0) return '';
  return `
    <tr><td style="padding:24px 16px 0;">
      <div style="font-size:16px;font-weight:bold;color:#b71c1c;">⚠️ 取得エラー (${errors.length}件)</div>
      <ul style="margin:8px 0 0;padding-left:20px;color:#666;font-size:13px;line-height:1.7;">
        ${errors
          .map(
            (e) =>
              `<li><strong>${escapeHtml(e.label)}</strong>: ${escapeHtml(e.err.kind)} — ${escapeHtml(e.err.message)}</li>`,
          )
          .join('')}
      </ul>
    </td></tr>
  `;
}

function renderFooter(snapshot: FullSnapshot): string {
  return `
    <tr><td style="padding:32px 16px 16px;border-top:1px solid #eee;color:#888;font-size:12px;line-height:1.6;">
      このメールは TDR ホテル空き状況ウォッチャー により ${formatDateTime(snapshot.fetchedAt)} に自動生成されました。<br>
      予約自体は <a href="https://reserve.tokyodisneyresort.jp/" style="color:#1976d2;">公式予約サイト</a> から行ってください。<br>
      表示は available (○) と limited (残N) のみ。満室 (×) と受付外 (-) は省略しています。
    </td></tr>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// CalendarMonth は型表示用に再export
export type { CalendarMonth };
