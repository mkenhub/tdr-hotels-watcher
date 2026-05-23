export type SmtpProvider = 'gmail' | 'yahoo' | 'outlook' | 'icloud' | 'other';

export type SmtpConnection = {
  host: string;
  port: number;
  secure: boolean;
};

export const SMTP_PRESETS: Record<Exclude<SmtpProvider, 'other'>, SmtpConnection> = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  yahoo: { host: 'smtp.mail.yahoo.co.jp', port: 587, secure: false },
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  icloud: { host: 'smtp.mail.me.com', port: 587, secure: false },
};

export const PROVIDER_LABELS: Record<SmtpProvider, string> = {
  gmail: 'Gmail (Googleアカウント)',
  yahoo: 'Yahoo!メール',
  outlook: 'Outlook.com / Hotmail',
  icloud: 'iCloud',
  other: 'その他 (手動でSMTP設定)',
};

export const PROVIDER_HINTS: Partial<Record<SmtpProvider, string>> = {
  gmail:
    'Gmail を使う場合は通常のパスワードではなく「アプリパスワード」が必要です。\n  発行URL: https://myaccount.google.com/apppasswords (2段階認証ON必須)',
};
