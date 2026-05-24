import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ConfigLoadError,
  configFileExists,
  loadConfig,
  runWizard,
} from './config/index.js';
import { fetchAll } from './fetcher/index.js';
import { render, renderSummary } from './renderer/index.js';
import { sendMail } from './notifier/index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  if (args.includes('--setup')) {
    await runWizard({ cwd });
    return;
  }
  if (args.includes('--reset')) {
    handleReset(cwd);
    return;
  }

  if (!configFileExists(cwd)) {
    console.log('config.yaml が見つかりません。初回セットアップを開始します。\n');
    await runWizard({ cwd });
    return;
  }

  let loaded;
  try {
    loaded = loadConfig(cwd);
  } catch (e) {
    if (e instanceof ConfigLoadError) {
      console.error(`\n❌ 設定読み込み失敗:\n${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  const { config, smtpPassword } = loaded;
  const log = (msg: string) => console.log(msg);

  log('=== TDR ホテル空き状況取得を開始 ===');
  const snapshot = await fetchAll(config, { log });
  log(`=== 取得完了: ${snapshot.hotels.length} ホテル ===`);

  const html = render(snapshot);
  const summaryHtml = renderSummary(snapshot);
  const stamp = isoStamp(snapshot.fetchedAt);

  if (config.report.save_to_file) {
    const outDir = resolve(cwd, config.report.output_dir);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `report-${stamp}.html`);
    writeFileSync(outPath, html, 'utf-8');
    log(`📄 レポートをファイル保存: ${outPath}`);
  }

  const totalRooms = snapshot.hotels.flatMap((h) => h.roomTypes).length;
  const hasAnyData = totalRooms > 0;
  const totalFailure = !hasAnyData;

  if (totalFailure && !config.behavior.notify_on_total_failure) {
    log('⚠️ 1件もデータが取れなかったためメール送信をスキップ (notify_on_total_failure=false)');
    process.exit(1);
  }

  log(`📧 メール送信中... to=${config.smtp.to.join(', ')}`);
  try {
    await sendMail(config, {
      htmlBody: summaryHtml,
      fetchedAt: snapshot.fetchedAt,
      smtpPassword,
      attachment: {
        filename: `tdr-report-${stamp}.html`,
        content: html,
      },
    });
    log('✓ メール送信完了 (サマリー本文 + 詳細HTML添付)');
  } catch (e) {
    console.error(`❌ メール送信失敗: ${(e as Error).message}`);
    process.exit(2);
  }
}

function handleReset(cwd: string): void {
  const configPath = resolve(cwd, 'config.yaml');
  const envPath = resolve(cwd, '.env');
  const targets = [configPath, envPath].filter((p) => existsSync(p));
  if (targets.length === 0) {
    console.log('削除対象ファイルがありません。');
    return;
  }
  console.log('以下のファイルを削除します:');
  for (const p of targets) console.log(`  - ${p}`);
  console.log(
    '\n削除を実行するには `npm run reset -- --confirm` で再実行してください。\n（誤削除防止のため確認フラグが必要）',
  );
  if (!process.argv.includes('--confirm')) return;
  for (const p of targets) {
    rmSync(p);
    console.log(`✓ 削除: ${p}`);
  }
}

function isoStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

main().catch((e) => {
  console.error('\n❌ 想定外のエラー:', e);
  process.exit(99);
});
