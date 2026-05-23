import type { Page } from 'playwright';

/**
 * 待機ページの検出と離脱まちロジック。
 *
 * TDR が混雑時に表示する「順番待ち」ページを検出する。
 * 検出ヒューリスティクスは複数のパターンに対応:
 *  - URL に "queue" / "waiting" / "wr." 等を含む
 *  - 本文に「順番」「お待ちください」「混雑」等のキーワードを含む
 */
export async function isWaitingPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/queue|waiting|wr\.|virtual-waiting/i.test(url)) return true;
  if (!/reserve\.tokyodisneyresort\.jp/.test(url)) {
    // 全く別のドメインに飛ばされたら待機ページの可能性が高い
    return true;
  }

  // ページ本文の文言で判定
  try {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    if (
      /順番にご案内|順番待ち|お待ちください|混雑のため|Waiting Room|まもなくご案内/i.test(text)
    ) {
      return true;
    }
  } catch {
    // ナビゲーション中などで evaluate に失敗するケースは無視
  }

  return false;
}

export type WaitingRoomOptions = {
  maxWaitMinutes: number;
  pollIntervalMs?: number;
  onWait?: (elapsedMs: number) => void;
};

export class WaitingRoomTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaitingRoomTimeoutError';
  }
}

/**
 * 待機ページを検出したら離脱するまで待つ。離脱しない場合は WaitingRoomTimeoutError。
 */
export async function handleWaitingRoom(page: Page, opts: WaitingRoomOptions): Promise<void> {
  const interval = opts.pollIntervalMs ?? 30_000;
  const start = Date.now();
  const maxMs = opts.maxWaitMinutes * 60_000;

  while (await isWaitingPage(page)) {
    const elapsed = Date.now() - start;
    if (elapsed > maxMs) {
      throw new WaitingRoomTimeoutError(
        `待機ページから${opts.maxWaitMinutes}分以内に抜けられませんでした`,
      );
    }
    opts.onWait?.(elapsed);
    await page.waitForTimeout(interval);
  }
}
