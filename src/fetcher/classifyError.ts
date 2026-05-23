import type { Page } from 'playwright';
import type { ClassifiedError } from '../types.js';
import { CalendarParseError } from './parseCalendar.js';
import { RoomTypeParseError } from './parseRoomType.js';
import { WaitingRoomTimeoutError } from './waitingRoom.js';

/**
 * Playwright/パース等の例外を ClassifiedError に変換する。
 * page が渡されればページ内容も参考にする。
 */
export async function classifyError(
  err: unknown,
  page?: Page,
): Promise<ClassifiedError> {
  // 待機ページタイムアウト
  if (err instanceof WaitingRoomTimeoutError) {
    return { kind: 'waiting_room_timeout', message: err.message };
  }

  // パース失敗
  if (err instanceof CalendarParseError) {
    return {
      kind: 'parse_failure',
      message: err.message,
      htmlSnippet: err.htmlSnippet,
    };
  }
  if (err instanceof RoomTypeParseError) {
    return {
      kind: 'parse_failure',
      message: err.message,
      htmlSnippet: err.classAttr,
    };
  }

  // ページ内容から判定
  // 注意: 部屋名自体に「定員」「ご利用人数」等が含まれることがあるため、
  // 「実際のエラー応答」だけにマッチするように特異な文言を使う
  if (page) {
    try {
      const text = await page.evaluate(() => document.body?.innerText ?? '');
      if (/人数の上限を超えて|ご指定の人数では|定員を超えています/.test(text)) {
        return { kind: 'guest_limit_exceeded', message: 'TDRが人数上限超過と判定' };
      }
      if (/ご指定の条件では|該当する部屋|条件を変更して/.test(text)) {
        return { kind: 'room_not_searchable', message: 'TDRが検索条件不可と判定' };
      }
      if (/Access Denied|アクセスが拒否|automated tools|automation detected/i.test(text)) {
        return { kind: 'bot_detected', message: 'ボット判定とおぼしき応答' };
      }
    } catch {
      // page が既に閉じられていれば無視
    }
  }

  const e = err as { name?: string; message?: string; stack?: string };
  if (e?.name === 'TimeoutError' || /timeout/i.test(e?.message ?? '')) {
    return { kind: 'navigation_timeout', message: e.message ?? 'timeout' };
  }

  return {
    kind: 'unknown',
    message: e?.message ?? String(err),
    ...(e?.stack ? { stack: e.stack } : {}),
  };
}
