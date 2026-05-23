/**
 * 1ホテルだけを実際にfetchHotelで完走させるスモークテスト。
 * 実行: npx tsx scripts/smoke-fetch-one.ts FSH
 */
import { chromium } from 'playwright';
import { fetchHotel } from '../src/fetcher/fetchHotel.js';
import { HOTELS_BY_CODE, type HotelCode } from '../src/hotels/registry.js';

async function main() {
  const code = (process.argv[2] ?? 'FSH') as HotelCode;
  const hotel = HOTELS_BY_CODE[code];
  if (!hotel) {
    console.error(`Unknown hotel code: ${code}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });

  const start = Date.now();
  const snap = await fetchHotel(hotel, ctx, {
    workerId: 0,
    search: {
      adults: 2,
      children: [
        { age: '5', sleeping: 'with_bed' },
        { age: '2', sleeping: 'co_sleep' },
      ],
      rooms: 1,
      nights: 1,
    },
    waitingRoom: { maxWaitMinutes: 5 },
    log: (m) => console.log(m),
  });
  const elapsedSec = Math.floor((Date.now() - start) / 1000);

  console.log(`\n=== Result (${elapsedSec}s) ===`);
  console.log(`hotel: ${snap.hotelCode} ${snap.hotelName}`);
  console.log(`room types: ${snap.roomTypes.length}`);
  console.log(`hotel error: ${snap.error ? snap.error.kind + ' / ' + snap.error.message : 'none'}`);
  for (const rt of snap.roomTypes.slice(0, 5)) {
    const totalDays = rt.months.reduce((acc, m) => acc + m.days.length, 0);
    const avail = rt.months
      .flatMap((m) => m.days)
      .filter((d) => d.state.kind === 'available' || d.state.kind === 'limited').length;
    console.log(
      `  - ${rt.area} ${rt.roomTypeName}: ${rt.months.length}月 / ${totalDays}日 / 空き${avail}件${
        rt.error ? ` (ERROR: ${rt.error.kind})` : ''
      }`,
    );
  }
  if (snap.roomTypes.length > 5) {
    console.log(`  ... 他 ${snap.roomTypes.length - 5}部屋`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
