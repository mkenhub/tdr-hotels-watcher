/**
 * 1ホテルを fetchHotel で巡回しつつ、詳細を全件出力する診断用スクリプト。
 * 実行: npx tsx scripts/smoke-fetch-debug.ts DCH [--no-children]
 */
import { chromium } from 'playwright';
import { fetchHotel } from '../src/fetcher/fetchHotel.js';
import { HOTELS_BY_CODE, type HotelCode } from '../src/hotels/registry.js';
import type { SearchParams } from '../src/types.js';

async function main() {
  const code = (process.argv[2] ?? 'DCH') as HotelCode;
  const noChildren = process.argv.includes('--no-children');
  const maxArg = process.argv.find((a) => a.startsWith('--max='));
  const maxRooms = maxArg ? Number(maxArg.slice('--max='.length)) : undefined;
  const hotel = HOTELS_BY_CODE[code];
  if (!hotel) {
    console.error(`Unknown hotel code: ${code}`);
    process.exit(1);
  }

  const search: SearchParams = noChildren
    ? { adults: 2, children: [], rooms: 1, nights: 1 }
    : {
        adults: 2,
        children: [
          { age: '5', sleeping: 'with_bed' },
          { age: '2', sleeping: 'co_sleep' },
        ],
        rooms: 1,
        nights: 1,
      };

  console.log(`--- ${code} ${hotel.name} ---`);
  console.log(`search: adults=${search.adults}, children=${search.children.length}, rooms=${search.rooms}, nights=${search.nights}`);

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
    search,
    waitingRoom: { maxWaitMinutes: 5 },
    log: (m) => console.log(m),
    ...(maxRooms !== undefined ? { maxRooms } : {}),
  });
  const elapsedSec = Math.floor((Date.now() - start) / 1000);

  console.log(`\n=== Result (${elapsedSec}s) ===`);
  console.log(`hotel error: ${snap.error ? `${snap.error.kind} / ${snap.error.message}` : 'none'}`);
  console.log(`\nALL ${snap.roomTypes.length} room types:`);
  snap.roomTypes.forEach((rt, i) => {
    const totalDays = rt.months.reduce((acc, m) => acc + m.days.length, 0);
    const avail = rt.months
      .flatMap((m) => m.days)
      .filter((d) => d.state.kind === 'available' || d.state.kind === 'limited').length;
    const errMark = rt.error ? ` ❌ ${rt.error.kind}` : ' ✓';
    console.log(`  ${String(i + 1).padStart(2)}. [${rt.area}] / [${rt.roomTypeName}]: ${rt.months.length}月/${totalDays}日/空${avail}${errMark}`);
  });

  // 集計
  const successCount = snap.roomTypes.filter((rt) => !rt.error).length;
  const errorByKind: Record<string, number> = {};
  for (const rt of snap.roomTypes) {
    if (rt.error) {
      errorByKind[rt.error.kind] = (errorByKind[rt.error.kind] ?? 0) + 1;
    }
  }
  console.log(`\n成功: ${successCount} / 失敗: ${snap.roomTypes.length - successCount}`);
  for (const [kind, n] of Object.entries(errorByKind)) {
    console.log(`  - ${kind}: ${n}件`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
