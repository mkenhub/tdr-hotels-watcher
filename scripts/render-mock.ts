/**
 * モックデータで Renderer を動かして HTML を出力する（動作確認用）
 * 実行: npx tsx scripts/render-mock.ts > /tmp/mock-report.html
 */
import { render } from '../src/renderer/index.js';
import type { FullSnapshot } from '../src/types.js';

const snapshot: FullSnapshot = {
  fetchedAt: new Date('2026-05-24T00:30:00+09:00'),
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
                { date: 20, dayOfWeek: 'sat', state: { kind: 'full' } },
              ],
            },
            {
              yearMonth: '2026-07',
              days: [
                { date: 3, dayOfWeek: 'fri', state: { kind: 'limited', remaining: 2, priceJpy: 48000 } },
                { date: 10, dayOfWeek: 'fri', state: { kind: 'full' } },
              ],
            },
          ],
        },
        {
          hotelCode: 'DAH',
          area: 'ミッキーマウスルーム',
          roomTypeName: 'デラックスタイプ',
          months: [
            {
              yearMonth: '2026-09',
              days: [
                { date: 5, dayOfWeek: 'sat', state: { kind: 'limited', remaining: 1, priceJpy: 85000 } },
              ],
            },
          ],
        },
        {
          hotelCode: 'DAH',
          area: 'コンシェルジュ',
          roomTypeName: 'ターレットルーム',
          months: [
            {
              yearMonth: '2026-06',
              days: [
                { date: 1, dayOfWeek: 'mon', state: { kind: 'full' } },
                { date: 2, dayOfWeek: 'tue', state: { kind: 'full' } },
              ],
            },
          ],
        },
      ],
    },
    {
      hotelCode: 'DHM',
      hotelName: '東京ディズニーシー・ホテルミラコスタ',
      fetchedAt: new Date(),
      roomTypes: [
        {
          hotelCode: 'DHM',
          area: 'トスカーナ・サイド',
          roomTypeName: 'カピターノ・ミッキー・スーペリアルーム',
          months: [
            {
              yearMonth: '2026-06',
              days: [
                { date: 1, dayOfWeek: 'mon', state: { kind: 'limited', remaining: 2, priceJpy: 89000 } },
                { date: 4, dayOfWeek: 'thu', state: { kind: 'limited', remaining: 1, priceJpy: 89000 } },
                { date: 7, dayOfWeek: 'sun', state: { kind: 'limited', remaining: 4, priceJpy: 89000 } },
              ],
            },
          ],
        },
        {
          hotelCode: 'DHM',
          area: 'ヴェネツィア・スイート',
          roomTypeName: 'デラックスタイプ',
          months: [],
          error: {
            kind: 'guest_limit_exceeded',
            message: '4名様までの部屋のため検索不可',
          },
        },
      ],
    },
    {
      hotelCode: 'FSH',
      hotelName: '東京ディズニーシー・ファンタジースプリングスホテル',
      fetchedAt: new Date(),
      roomTypes: [],
      error: { kind: 'waiting_room_timeout', message: '待機ページから30分以内に抜けられず' },
    },
  ],
};

const html = render(snapshot);
process.stdout.write(html);
