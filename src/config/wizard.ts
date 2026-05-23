import { writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkbox,
  confirm,
  input,
  number,
  password,
  select,
} from '@inquirer/prompts';
import { stringify as stringifyYaml } from 'yaml';
import { HOTELS } from '../hotels/registry.js';
import { CHILD_AGE_KEYS, CHILD_AGE_LABELS, CO_SLEEP_FORBIDDEN_AGES } from '../types.js';
import type { ChildAgeKey, ChildGuest, ChildSleeping } from '../types.js';
import { PROVIDER_HINTS, PROVIDER_LABELS, type SmtpProvider } from './presets.js';
import { ConfigSchema, type Config } from './schema.js';

export type WizardOptions = {
  cwd?: string;
  /** 既存設定がある場合のデフォルト値 */
  defaults?: Partial<Config>;
  /** 既存ファイルをバックアップして上書きするか */
  backupExisting?: boolean;
};

export async function runWizard(opts: WizardOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const configPath = resolve(cwd, 'config.yaml');
  const envPath = resolve(cwd, '.env');

  if (existsSync(configPath) && opts.backupExisting !== false) {
    const stamp = timestamp();
    const backupPath = resolve(cwd, `config.yaml.bak.${stamp}`);
    copyFileSync(configPath, backupPath);
    console.log(`既存 config.yaml を ${backupPath} にバックアップしました`);
  }

  console.log('\n=== TDR ホテル空き状況ウォッチャー 初回セットアップ ===\n');

  // --- 検索条件 ---
  console.log('--- 検索条件 ---');
  const adults = await number({
    message: '大人の人数 (18才以上)',
    default: opts.defaults?.search?.adults ?? 2,
    min: 1,
    max: 15,
  });
  const childCount = await number({
    message: '子どもの人数',
    default: opts.defaults?.search?.children?.length ?? 0,
    min: 0,
    max: 15,
  });

  const children: ChildGuest[] = [];
  for (let i = 0; i < (childCount ?? 0); i++) {
    console.log(`\n  子ども${i + 1}人目:`);
    const age = (await select({
      message: '  年齢',
      choices: CHILD_AGE_KEYS.map((k) => ({ name: CHILD_AGE_LABELS[k], value: k })),
    })) as ChildAgeKey;

    let sleeping: ChildSleeping;
    if (CO_SLEEP_FORBIDDEN_AGES.has(age)) {
      console.log('  → この年齢は添い寝不可、ベッド利用のみ');
      sleeping = 'with_bed';
    } else {
      sleeping = (await select({
        message: '  寝方',
        choices: [
          { name: '添い寝 (co_sleep)', value: 'co_sleep' as const },
          { name: 'ベッド利用 (with_bed)', value: 'with_bed' as const },
        ],
      })) as ChildSleeping;
    }
    children.push({ age, sleeping });
  }

  const rooms = await number({
    message: '部屋数',
    default: opts.defaults?.search?.rooms ?? 1,
    min: 1,
    max: 3,
  });
  const nights = await number({
    message: '泊数',
    default: opts.defaults?.search?.nights ?? 1,
    min: 1,
    max: 5,
  });

  // --- ホテル選択 ---
  console.log('\n--- 監視対象ホテル ---');
  const hotels = await checkbox({
    message: 'チェックを外すと監視対象から除外されます',
    choices: HOTELS.map((h) => ({
      name: `${h.code} ${h.name}`,
      value: h.code,
      checked: opts.defaults?.fetch?.hotels?.includes(h.code) ?? true,
    })),
    validate: (choices) => choices.length >= 1 || '最低1つは選択してください',
  });

  const concurrency = await number({
    message: '並列度 (1=直列推奨、2-5=並列)',
    default: opts.defaults?.fetch?.concurrency ?? 1,
    min: 1,
    max: 5,
  });

  // --- メール送信 ---
  console.log('\n--- メール送信設定 ---');
  const provider = (await select({
    message: 'メール送信に使うサービス',
    default: opts.defaults?.smtp?.provider ?? 'gmail',
    choices: (Object.keys(PROVIDER_LABELS) as SmtpProvider[]).map((p) => ({
      name: PROVIDER_LABELS[p],
      value: p,
    })),
  })) as SmtpProvider;

  if (PROVIDER_HINTS[provider]) {
    console.log(`\n⚠️  ${PROVIDER_HINTS[provider]}\n`);
  }

  const from = await input({
    message: '送信元メールアドレス',
    default: opts.defaults?.smtp?.from,
    validate: (v) => /.+@.+/.test(v) || 'メールアドレス形式で入力してください',
  });

  const toInput = await input({
    message: '送信先メールアドレス (カンマ区切りで複数可)',
    default: opts.defaults?.smtp?.to?.join(',') ?? from,
    validate: (v) =>
      v.split(',').every((s) => /.+@.+/.test(s.trim())) || '有効なメールアドレスを指定してください',
  });
  const to = toInput.split(',').map((s) => s.trim()).filter(Boolean);

  let customSmtp: { host: string; port: number; secure: boolean } | undefined;
  if (provider === 'other') {
    const host = await input({ message: 'SMTPホスト', validate: (v) => v.length > 0 || '必須' });
    const port = await number({ message: 'SMTPポート', default: 587, min: 1, max: 65535 });
    const secure = await confirm({ message: 'TLS (port 465) を使う？', default: false });
    customSmtp = { host, port: port ?? 587, secure };
  }

  const pwd = await password({
    message: 'メール送信用パスワード (隠し入力)',
    mask: '*',
    validate: (v) => v.length > 0 || 'パスワードは必須',
  });

  // --- 最終確認 ---
  console.log('\n--- 入力内容確認 ---');
  console.log(`大人: ${adults}名 / 子ども: ${children.length}名 / 部屋数: ${rooms} / 泊数: ${nights}`);
  console.log(`監視ホテル: ${(hotels as string[]).join(', ')}`);
  console.log(`並列度: ${concurrency}`);
  console.log(`SMTP: ${provider} / from=${from} / to=${to.join(', ')}`);
  const ok = await confirm({ message: '上記でファイルを生成しますか？', default: true });
  if (!ok) {
    console.log('セットアップを中止しました。');
    process.exit(1);
  }

  // --- ファイル書き出し ---
  const configObj: unknown = {
    search: { adults, children, rooms, nights },
    fetch: {
      concurrency,
      waiting_room: { enabled: true, max_wait_minutes: 30 },
      hotels,
    },
    smtp: {
      provider,
      from,
      to,
      subject_template: 'TDRホテル空き状況 {{date}} {{time}}',
      ...(customSmtp ?? {}),
    },
    report: { save_to_file: true, output_dir: './reports' },
    behavior: { notify_on_total_failure: false },
  };

  // 検証 (zod) してから書き込む
  const parsed = ConfigSchema.safeParse(configObj);
  if (!parsed.success) {
    console.error('入力内容が検証に失敗しました:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const yamlHeader = `# TDR ホテル空き状況ウォッチャー 設定ファイル
# このファイルは npm run setup で生成されました。
# 手動編集も可能です。設定変更後は npm run check で動作確認してください。

`;
  writeFileSync(configPath, yamlHeader + stringifyYaml(configObj), 'utf-8');

  const envContent = `# SMTP認証パスワード (.gitignore対象)\nSMTP_PASSWORD=${pwd}\n`;
  writeFileSync(envPath, envContent, 'utf-8');

  console.log('\n✓ config.yaml を生成しました');
  console.log('✓ .env を生成しました (SMTP_PASSWORD設定済み)');
  console.log('\nセットアップ完了。`npm run check` で取得を実行できます。\n');
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
