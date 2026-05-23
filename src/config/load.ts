import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './schema.js';

export type LoadedConfig = {
  config: Config;
  smtpPassword: string;
};

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

export function configFileExists(cwd: string = process.cwd()): boolean {
  return existsSync(resolve(cwd, 'config.yaml'));
}

/**
 * config.yaml と .env を読み込んで検証する。
 * - config.yaml が無ければ ConfigLoadError 投げる (呼び出し側でウィザード起動する想定)
 * - .env は dotenv 系を使わず、シンプルに `KEY=VALUE` 行を読む
 * - 環境変数 SMTP_PASSWORD が直接設定されていればそれを優先
 */
export function loadConfig(cwd: string = process.cwd()): LoadedConfig {
  const configPath = resolve(cwd, 'config.yaml');
  if (!existsSync(configPath)) {
    throw new ConfigLoadError(`config.yaml が見つかりません: ${configPath}`);
  }

  const yamlText = readFileSync(configPath, 'utf-8');
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new ConfigLoadError(`config.yaml のYAML解析に失敗: ${(e as Error).message}`);
  }

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigLoadError(`config.yaml の検証に失敗:\n${issues}`);
  }

  const smtpPassword = loadSmtpPassword(cwd);

  return { config: parsed.data, smtpPassword };
}

function loadSmtpPassword(cwd: string): string {
  if (process.env.SMTP_PASSWORD) {
    return process.env.SMTP_PASSWORD;
  }

  const envPath = resolve(cwd, '.env');
  if (!existsSync(envPath)) {
    throw new ConfigLoadError(
      '.env が見つかりません。SMTP_PASSWORD を環境変数か .env で設定してください',
    );
  }

  const envText = readFileSync(envPath, 'utf-8');
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && m[1] === 'SMTP_PASSWORD') {
      const value = stripQuotes(m[2] ?? '');
      if (!value) {
        throw new ConfigLoadError(
          '.env の SMTP_PASSWORD が空です。アプリパスワード等を設定してください',
        );
      }
      return value;
    }
  }

  throw new ConfigLoadError('.env に SMTP_PASSWORD が見つかりません');
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
