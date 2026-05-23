/**
 * 単一ホテルへのナビゲーションだけ検証する最小スクリプト。
 * 実行: npx tsx scripts/smoke-navigate.ts FSH
 */
import { chromium } from 'playwright';
import { hotelDetailUrl, type HotelCode } from '../src/hotels/registry.js';

async function main() {
  const code = (process.argv[2] ?? 'FSH') as HotelCode;
  const url = hotelDetailUrl(code);
  console.log(`navigate ${url}`);

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

  const start = Date.now();
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
    const tCommit = Date.now() - start;
    console.log(`  ✓ commit at ${tCommit}ms`);

    await page.waitForSelector('a.js-callVacancyStatusSearch', { timeout: 60_000 });
    const tLinks = Date.now() - start;
    const count = await page.locator('a.js-callVacancyStatusSearch').count();
    console.log(`  ✓ room links visible at ${tLinks}ms (count=${count})`);
  } catch (e) {
    console.error(`  ✗ ERROR after ${Date.now() - start}ms: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
