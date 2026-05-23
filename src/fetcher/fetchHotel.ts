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
  /** デバッグ用: 取得する部屋タイプ数の上限 */
  maxRooms?: number;
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
    // commit 待機: HTTP応答開始まで待つだけ。SPA内のXHR等で domcontentloaded が遅延しても進める
    await page.goto(hotelDetailUrl(hotel.code), { waitUntil: 'commit', timeout: 120_000 });
    await handleWaitingRoom(page, {
      maxWaitMinutes: opts.waitingRoom.maxWaitMinutes,
      onWait: (elapsed) => log(`待機ページ中... ${Math.floor(elapsed / 1000)}s`),
    });
    // 部屋リンクが描画されるまで明示的に待つ (網羅的な waitUntil より堅牢)
    await page
      .waitForSelector('a.js-callVacancyStatusSearch', { timeout: 60_000 })
      .catch(() => log('  ↳ 部屋リンク待機タイムアウト、続行を試みる'));
    // TDR のJSハンドラ配線が完了するのを待つ (リンクが見えてもまだ click が無反応な期間がある)
    log('  ↳ networkidle 待機 (最大30s)');
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    // 全部屋のメタ情報 (class属性) を先に収集してから個別処理する。
    // 個別処理時はページをリロードする (モーダル状態の蓄積を完全に避けるため)。
    const allMetas = await page.$$eval('a.js-callVacancyStatusSearch', (links) =>
      links.map((l) => ({ classAttr: l.getAttribute('class') })),
    );
    const roomMetas = opts.maxRooms !== undefined ? allMetas.slice(0, opts.maxRooms) : allMetas;
    log(
      `部屋タイプ: ${roomMetas.length}件${opts.maxRooms !== undefined ? ` (全${allMetas.length}件中、最初の${opts.maxRooms}件)` : ''}`,
    );

    const roomSnapshots: RoomTypeSnapshot[] = [];

    for (let i = 0; i < roomMetas.length; i++) {
      const meta = roomMetas[i];
      if (!meta) continue;

      let area = '';
      let roomTypeName = '';
      try {
        const info = parseRoomTypeFromClasses(meta.classAttr);
        area = info.area;
        roomTypeName = info.roomTypeName;
      } catch (e) {
        roomSnapshots.push({
          hotelCode: hotel.code,
          area: '(unknown area)',
          roomTypeName: '(unknown room)',
          months: [],
          error: await classifyError(e),
        });
        continue;
      }

      log(`[${i + 1}/${roomMetas.length}] ${area} / ${roomTypeName}`);

      // 2部屋目以降はページをリロードして状態をリセット
      if (i > 0) {
        await reloadAndSettle(page, hotel.code, opts);
      }

      try {
        const link = page.locator('a.js-callVacancyStatusSearch').nth(i);
        const months = await fetchRoomTypeCalendar(page, link, opts);
        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months,
        });
      } catch (e) {
        const classified = await classifyError(e, page);
        log(`  ↳ ERROR: ${classified.kind} ${classified.message.slice(0, 200)}`);
        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months: [],
          error: classified,
        });
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
  // モーダルを開く (リトライ付き: 初回click でハンドラ未配線等の場合がある)
  await link.scrollIntoViewIfNeeded();
  await openModalWithRetry(page, link);

  // 検索条件を入力
  await fillSearchForm(page, opts.search);

  // 「次へ」(モーダル内に限定して複数マッチを回避)
  await page.locator('#js-vacancyModal a.next.js-conditionHide').first().click();
  await page.waitForSelector('#js-vacancyModal #boxCalendarSelect', { timeout: 15_000 });

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
  // 大人は必須 (デフォルト0なので必ずセット)
  await page.selectOption('#adultNumVacancy', String(search.adults));

  // 子ども数。0なら default のままで OK (changeイベントによる副作用回避)
  if (search.children.length > 0) {
    await page.selectOption('#childNumVacancy', String(search.children.length));
    // 動的に追加される年齢/寝方フィールドが安定するまで少し待つ
    await page
      .waitForSelector(`select.hotelVacancyChildAge_${search.children.length}`, { timeout: 5_000 })
      .catch(() => {});

    for (let i = 0; i < search.children.length; i++) {
      const child = search.children[i];
      if (!child) continue;
      const idx = i + 1; // TDR は1-based
      const ageValue = CHILD_AGE_TDR_VALUE[child.age];
      await page.selectOption(`select.hotelVacancyChildAge_${idx}`, ageValue);

      // 寝方ラジオ。display:none で完全に非レイアウトなので evaluate で直接DOM操作
      await page.evaluate(
        ({ idx, sleep }: { idx: number; sleep: 'co_sleep' | 'with_bed' }) => {
          const lying = document.getElementById(`hotelVacancy_lyingbed_${idx}`) as HTMLInputElement | null;
          const bed = document.getElementById(`hotelVacancy_bed_${idx}`) as HTMLInputElement | null;
          if (!lying || !bed) return;
          if (sleep === 'co_sleep') {
            lying.checked = true;
            bed.checked = false;
          } else {
            bed.checked = true;
            lying.checked = false;
          }
          // change イベントを伝搬させて TDR 側 JS のリアクションをトリガ
          lying.dispatchEvent(new Event('change', { bubbles: true }));
          bed.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { idx, sleep: child.sleeping },
      );
    }
  }

  // 部屋数・泊数は default が 1。1 と等しいなら set しない
  if (search.rooms !== 1) {
    await page.selectOption('#roomsNumVacancy', String(search.rooms));
  }
  if (search.nights !== 1) {
    await page.selectOption('#stayDaysVacancy', String(search.nights));
  }
}

/**
 * ホテル詳細ページをリロードして JS 配線が完了するまで待つ。
 * 部屋ごとにモーダル状態をリセットするため。
 */
async function reloadAndSettle(
  page: Page,
  hotelCode: string,
  opts: FetchHotelOptions,
): Promise<void> {
  opts.log(`[worker-${opts.workerId}] ${hotelCode}   ↻ reload + settle`);
  await page.goto(hotelDetailUrl(hotelCode as never), {
    waitUntil: 'commit',
    timeout: 120_000,
  });
  await handleWaitingRoom(page, { maxWaitMinutes: opts.waitingRoom.maxWaitMinutes });
  await page
    .waitForSelector('a.js-callVacancyStatusSearch', { timeout: 60_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
}

async function closeModalIfOpen(page: Page): Promise<void> {
  // ×ボタンクリック → ダメなら Escape → ダメなら強制的に display:none
  const closeBtn = page.locator('.closeModal.vacancy').first();
  if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible().catch(() => false))) {
    await closeBtn.click().catch(() => {});
  }
  const closed = await page
    .waitForSelector('#js-vacancyModal', { state: 'hidden', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (closed) return;

  // フォールバック1: Escape
  await page.keyboard.press('Escape').catch(() => {});
  const closed2 = await page
    .waitForSelector('#js-vacancyModal', { state: 'hidden', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (closed2) return;

  // フォールバック2: JSで強制非表示
  await page
    .evaluate(() => {
      const m = document.querySelector('#js-vacancyModal') as HTMLElement | null;
      const overlay = document.querySelector('.modalOverlay.vacancy') as HTMLElement | null;
      if (m) m.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    })
    .catch(() => {});
}

/**
 * モーダルを開く。初回click で開かない場合のリトライを内蔵。
 * 「次の部屋へ移る時にクリックハンドラが一時的に未配線になる」現象に対応。
 */
async function openModalWithRetry(page: Page, link: import('playwright').Locator): Promise<void> {
  const maxAttempts = 3;
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await link.click();
      await page.waitForSelector('#js-vacancyModal', { state: 'visible', timeout: 8_000 });
      await page.waitForSelector('#js-vacancyModal #adultNumVacancy', { timeout: 8_000 });
      return; // 成功
    } catch (e) {
      lastErr = e as Error;
      if (attempt < maxAttempts) {
        // 失敗時: いったんモーダルを閉じて、少し待ってから再試行
        await closeModalIfOpen(page);
        await page.waitForTimeout(1_500);
      }
    }
  }
  throw lastErr ?? new Error('Modal failed to open');
}
