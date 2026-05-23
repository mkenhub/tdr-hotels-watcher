import { chromium } from 'playwright';
import type { Config } from '../config/schema.js';
import { HOTELS_BY_CODE, type HotelCode, type HotelDef } from '../hotels/registry.js';
import type { FullSnapshot, HotelSnapshot } from '../types.js';
import { classifyError } from './classifyError.js';
import { fetchHotel } from './fetchHotel.js';

export type FetchAllOptions = {
  log?: (msg: string) => void;
};

export async function fetchAll(config: Config, opts: FetchAllOptions = {}): Promise<FullSnapshot> {
  const log = opts.log ?? ((msg) => console.log(msg));
  const fetchedAt = new Date();
  const targetHotels: HotelDef[] = config.fetch.hotels
    .map((code) => HOTELS_BY_CODE[code as HotelCode])
    .filter((h): h is HotelDef => h !== undefined);

  log(`対象ホテル: ${targetHotels.map((h) => h.code).join(', ')}`);
  log(`並列度: ${config.fetch.concurrency}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const queue = [...targetHotels];
    const concurrency = Math.min(config.fetch.concurrency, targetHotels.length || 1);

    const workers = Array.from({ length: concurrency }).map(async (_, workerId) => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ja-JP',
      });
      const results: HotelSnapshot[] = [];
      try {
        while (queue.length > 0) {
          const hotel = queue.shift();
          if (!hotel) break;
          try {
            const snap = await fetchHotel(hotel, ctx, {
              workerId,
              search: config.search,
              waitingRoom: { maxWaitMinutes: config.fetch.waiting_room.max_wait_minutes },
              log,
            });
            results.push(snap);
          } catch (e) {
            results.push({
              hotelCode: hotel.code,
              hotelName: hotel.name,
              fetchedAt: new Date(),
              roomTypes: [],
              error: await classifyError(e),
            });
          }
        }
      } finally {
        await ctx.close().catch(() => {});
      }
      return results;
    });

    const hotels = (await Promise.all(workers)).flat();

    return {
      fetchedAt,
      searchParams: config.search,
      visibleMonthRange: computeVisibleMonthRange(hotels),
      hotels,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function computeVisibleMonthRange(hotels: HotelSnapshot[]): FullSnapshot['visibleMonthRange'] {
  const months = hotels
    .flatMap((h) => h.roomTypes)
    .flatMap((r) => r.months.map((m) => m.yearMonth))
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .sort();
  return {
    from: months[0] ?? '',
    to: months[months.length - 1] ?? '',
  };
}
