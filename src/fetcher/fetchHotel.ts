import type { BrowserContext, Locator, Page } from 'playwright';
import { hotelDetailUrl, type HotelDef } from '../hotels/registry.js';
import {
  CHILD_AGE_TDR_VALUE,
  type CalendarMonth,
  type ClassifiedError,
  type HotelSnapshot,
  type RoomTypeSnapshot,
  type SearchParams,
} from '../types.js';
import { classifyError } from './classifyError.js';
import { parseCalendar } from './parseCalendar.js';
import { parseRoomTypeFromClasses } from './parseRoomType.js';
import { handleWaitingRoom } from './waitingRoom.js';

export type FetchHotelOptions = {
  workerId: number;
  search: SearchParams;
  waitingRoom: { maxWaitMinutes: number };
  log: (msg: string) => void;
};

export async function fetchHotel(
  hotel: HotelDef,
  ctx: BrowserContext,
  opts: FetchHotelOptions,
): Promise<HotelSnapshot> {
  const fetchedAt = new Date();
  const page = await ctx.newPage();
  const log = (msg: string) => opts.log(`[worker-${opts.workerId}] ${hotel.code} ${msg}`);

  try {
    log(`navigate ${hotelDetailUrl(hotel.code)}`);
    await page.goto(hotelDetailUrl(hotel.code), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await handleWaitingRoom(page, {
      maxWaitMinutes: opts.waitingRoom.maxWaitMinutes,
      onWait: (elapsed) => log(`待機ページ中... ${Math.floor(elapsed / 1000)}s`),
    });

    const roomLinkCount = await page.locator('a.js-callVacancyStatusSearch').count();
    log(`部屋タイプ: ${roomLinkCount}件`);

    const roomSnapshots: RoomTypeSnapshot[] = [];

    for (let i = 0; i < roomLinkCount; i++) {
      const link = page.locator('a.js-callVacancyStatusSearch').nth(i);
      let area = '';
      let roomTypeName = '';
      try {
        const cls = await link.getAttribute('class');
        const info = parseRoomTypeFromClasses(cls);
        area = info.area;
        roomTypeName = info.roomTypeName;
      } catch (e) {
        // class属性が異常なケース、その部屋タイプはスキップする
        roomSnapshots.push({
          hotelCode: hotel.code,
          area: area || '(unknown area)',
          roomTypeName: roomTypeName || '(unknown room)',
          months: [],
          error: await classifyError(e),
        });
        continue;
      }

      log(`[${i + 1}/${roomLinkCount}] ${area} / ${roomTypeName}`);

      try {
        const months = await fetchRoomTypeCalendar(page, link, opts);
        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months,
        });
      } catch (e) {
        const classified = await classifyError(e, page);
        log(`  ↳ ERROR: ${classified.kind} ${classified.message.slice(0, 80)}`);
        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months: [],
          error: classified,
        });
      } finally {
        await closeModalIfOpen(page);
      }
    }

    return {
      hotelCode: hotel.code,
      hotelName: hotel.name,
      fetchedAt,
      roomTypes: roomSnapshots,
    };
  } catch (e) {
    const classified: ClassifiedError = await classifyError(e, page);
    log(`HOTEL FAILED: ${classified.kind} ${classified.message}`);
    return {
      hotelCode: hotel.code,
      hotelName: hotel.name,
      fetchedAt,
      roomTypes: [],
      error: classified,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchRoomTypeCalendar(
  page: Page,
  link: Locator,
  opts: FetchHotelOptions,
): Promise<CalendarMonth[]> {
  // モーダルを開く
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await page.waitForSelector('#js-vacancyModal', { state: 'visible', timeout: 15_000 });

  // 検索条件を入力
  await fillSearchForm(page, opts.search);

  // 「次へ」
  await page.locator('a.next.js-conditionHide').click();
  await page.waitForSelector('#boxCalendarSelect', { timeout: 15_000 });

  // 表示可能な月を全列挙 (blankを除く)
  const monthValues = await page.$$eval('#boxCalendarSelect option', (opts) =>
    opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v && v !== 'blank'),
  );

  const months: CalendarMonth[] = [];
  for (const monthValue of monthValues) {
    await page.selectOption('#boxCalendarSelect', monthValue);
    // セルが描画されるまで待つ
    await page
      .waitForFunction(
        () => !!document.querySelector('table.vacancyCalTable td[class*="cal_"]'),
        null,
        { timeout: 15_000 },
      )
      .catch(() => {
        /* 全月が "受付外" だけのケースもあるためエラーは握りつぶす */
      });
    const html = await page.locator('table.vacancyCalTable').first().evaluate((el) => el.outerHTML);
    months.push(parseCalendar(html, monthValue));
  }

  return months;
}

async function fillSearchForm(page: Page, search: SearchParams): Promise<void> {
  await page.selectOption('#adultNumVacancy', String(search.adults));
  await page.selectOption('#childNumVacancy', String(search.children.length));

  // 子どもの年齢・寝方を1人ずつ設定
  for (let i = 0; i < search.children.length; i++) {
    const child = search.children[i];
    if (!child) continue;
    const idx = i + 1; // TDR は1-based
    const ageValue = CHILD_AGE_TDR_VALUE[child.age];
    await page.selectOption(`select.hotelVacancyChildAge_${idx}`, ageValue);
    // 寝方ラジオ。hiddenRadio クラスで非表示なので force:true
    if (child.sleeping === 'co_sleep') {
      await page.locator(`#hotelVacancy_lyingbed_${idx}`).check({ force: true });
    } else {
      await page.locator(`#hotelVacancy_bed_${idx}`).check({ force: true });
    }
  }

  await page.selectOption('#roomsNumVacancy', String(search.rooms));
  await page.selectOption('#stayDaysVacancy', String(search.nights));
}

async function closeModalIfOpen(page: Page): Promise<void> {
  const closeBtn = page.locator('.closeModal.vacancy').first();
  if ((await closeBtn.count()) === 0) return;
  if (!(await closeBtn.isVisible().catch(() => false))) return;
  await closeBtn.click().catch(() => {});
  // モーダルが完全に閉じるまで少し待つ
  await page
    .waitForSelector('#js-vacancyModal', { state: 'hidden', timeout: 5_000 })
    .catch(() => {});
}
