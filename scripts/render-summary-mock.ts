/**
 * モックデータでサマリーHTMLを生成して目視確認用。
 * 実行: npx tsx scripts/render-summary-mock.ts > /tmp/summary.html
 */
import { renderSummary } from '../src/renderer/index.js';
import type { FullSnapshot } from '../src/types.js';

const snapshot: FullSnapshot = {
  fetchedAt: new Date('2026-05-24T13:00:00+09:00'),
  searchParams: {
    adults: 2,
    children: [
      { age: '5', sleeping: 'with_bed' },
      { age: '2', sleeping: 'co_sleep' },
    ],
    rooms: 1,
    nights: 1,
  },
  visibleMonthRange: { from: '2026-05', to: '2026-09' },
  hotels: [
    {
      hotelCode: 'DAH',
      hotelName: 'ディズニーアンバサダーホテル',
      fetchedAt: new Date(),
      roomTypes: [
        {
          hotelCode: 'DAH',
          area: 'スーペリアルーム',
          roomTypeName: '山側',
          months: [
            {
              yearMonth: '2026-06',
              days: [
                { date: 15, dayOfWeek: 'mon', state: { kind: 'available', priceJpy: 43000 } },
                { date: 16, dayOfWeek: 'tue', state: { kind: 'available', priceJpy: 43000 } },
              ],
            },
          ],
        },
      ],
    },
    {
      hotelCode: 'DCH',
      hotelName: '東京ディズニーセレブレーションホテル',
      fetchedAt: new Date(),
      roomTypes: [],
      error: { kind: 'waiting_room_timeout', message: '待機ページから30分以内に抜けられず' },
    },
    {
      hotelCode: 'DHM',
      hotelName: '東京ディズニーシー・ホテルミラコスタ',
      fetchedAt: new Date(),
      roomTypes: [
        {
          hotelCode: 'DHM',
          area: 'ヴェネツィア・スイート',
          roomTypeName: 'デラックスタイプ',
          months: [],
          error: { kind: 'guest_limit_exceeded', message: '4名様までの部屋' },
        },
      ],
    },
  ],
};

process.stdout.write(renderSummary(snapshot));
