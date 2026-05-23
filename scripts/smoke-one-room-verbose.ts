/**
 * 1ホテルの1部屋だけを段階的に処理して、どこで失敗するかを切り分けるスクリプト。
 * 実行: npx tsx scripts/smoke-one-room-verbose.ts DCH 0
 */
import { chromium } from 'playwright';
import { hotelDetailUrl, type HotelCode } from '../src/hotels/registry.js';

async function main() {
  const code = (process.argv[2] ?? 'DCH') as HotelCode;
  const idx = Number(process.argv[3] ?? 0);
  const url = hotelDetailUrl(code);

  const t0 = Date.now();
  const step = (label: string) =>
    console.log(`[+${(Date.now() - t0) / 1000}s] ${label}`);

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
  const page = await ctx.newPage();

  step(`goto ${url}`);
  await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  step('  commit done');
  await page.waitForSelector('a.js-callVacancyStatusSearch', { timeout: 60_000 });
  step('  room links visible');

  // ページのJS初期化が完了するまで少し待つ
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  step('  networkidle (or timeout)');

  // 念のため明示的に2秒待つ
  await page.waitForTimeout(2_000);
  step('  +2s wait');

  step(`click room nth=${idx}`);
  await page.locator('a.js-callVacancyStatusSearch').nth(idx).scrollIntoViewIfNeeded();
  await page.locator('a.js-callVacancyStatusSearch').nth(idx).click();

  step('wait #js-vacancyModal visible');
  await page.waitForSelector('#js-vacancyModal', { state: 'visible', timeout: 15_000 });
  step('  modal visible');

  step('wait modal innards (#adultNumVacancy)');
  try {
    await page.waitForSelector('#js-vacancyModal #adultNumVacancy', { timeout: 10_000 });
    step('  #adultNumVacancy found');
  } catch (e) {
    step(`  ✗ TIMEOUT: ${(e as Error).message.slice(0, 80)}`);
    // 失敗時のモーダル状態を観察
    const state = await page.evaluate(() => {
      const modal = document.querySelector('#js-vacancyModal');
      if (!modal) return { error: 'modal not found' };
      const innerText = (modal as HTMLElement).innerText.slice(0, 300);
      const ids = Array.from(modal.querySelectorAll('[id]')).map((el) => el.id).slice(0, 30);
      const adultSelector = modal.querySelector('#adultNumVacancy');
      const adultExists = !!adultSelector;
      const adultVisible = adultSelector ? (adultSelector as HTMLElement).offsetHeight > 0 : false;
      return { innerText, ids, adultExists, adultVisible };
    });
    console.log('Modal state:', JSON.stringify(state, null, 2).slice(0, 2000));
  }

  await page.waitForTimeout(2_000);
  await browser.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
