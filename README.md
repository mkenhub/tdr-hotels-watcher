# TDR ホテル空き状況ウォッチャー

東京ディズニーリゾート (TDR) 直営6ホテル × 全部屋タイプ × 表示可能な全月 (今日を起点に約5ヶ月先まで) の予約状況をまとめて取得し、空きがある日付だけを HTML レポートにしてメール送信するツールです。

公式予約サイト [reserve.tokyodisneyresort.jp](https://reserve.tokyodisneyresort.jp/) は1部屋1月ずつしかカレンダーを確認できません。このツールはそれを**1回の実行で全部まとめてプッシュ通知**してくれます。

## 機能概要

- 対象: ディズニーホテル ミラコスタ / ランドホテル / アンバサダー / ファンタジースプリングス / トイ・ストーリー / セレブレーション の6ホテル
- 取得対象: 各ホテルの全部屋タイプ × 表示可能な全月 (5ヶ月分)
- 出力: 「空きあり (○)」「残少 (残N)」のみを抽出した HTML レポートをメール本文インラインで送信
- 「満室 (×)」「受付外 (-)」は省略 (公式サイトと同じ情報を取得しているだけなので、空きのある日付に絞ることでメール本文を小さく保つ)
- ホテル単位 / 部屋タイプ単位 / 月単位でエラーを握りつぶし、部分結果でもレポートを送る設計

## 必要環境

- Node.js 20以上
- メール送信用の SMTP アカウント (Gmail / Yahoo / Outlook / iCloud / その他)

## クイックスタート (ローカル実行)

```bash
git clone https://github.com/mkenhub/disney-hotel-reservation.git
cd disney-hotel-reservation
npm install
npx playwright install chromium

# 初回起動時に対話ウィザードが立ち上がり config.yaml と .env を生成します
npm run check
```

### Gmail を使う場合の注意

通常のパスワードでは認証に失敗します。**アプリパスワード**を発行してください。

1. Googleアカウントの2段階認証を有効化
2. https://myaccount.google.com/apppasswords でアプリパスワードを発行
3. ウィザードのパスワード入力欄に貼り付ける

## コマンド

| コマンド | 動作 |
|---|---|
| `npm run check` | 通常実行。`config.yaml` が無ければ自動でウィザード起動 |
| `npm run setup` | 強制的にウィザードを起動 (既存 `config.yaml` は自動バックアップ) |
| `npm run reset -- --confirm` | `config.yaml` と `.env` を削除してクリーンスタート |
| `npm test` | パーサーのユニットテストを実行 |
| `npm run typecheck` | TypeScript 型チェックのみ実行 |

## 設定ファイル

`config.yaml` の主な項目:

```yaml
search:
  adults: 2                    # 18才以上
  children: []                 # 子どもなし。詳細は config.example.yaml 参照
  rooms: 1                     # 部屋数
  nights: 1                    # 泊数

fetch:
  concurrency: 1               # 1=直列(推奨), 2-5=並列 (高速だがbot検出リスクあり)
  hotels: [FSH, TDH, DAH, DHM, TSH, DCH]  # 監視対象ホテル

smtp:
  provider: gmail              # gmail | yahoo | outlook | icloud | other
  from: your-address@gmail.com
  to:
    - your-email@example.com
```

詳細は `config.example.yaml` を参照してください。SMTP のホストとポートはプロバイダ名から自動解決されるので、ユーザーが意識する必要はありません (`other` のときだけ手動指定)。

## 定期実行のセットアップ

ツール本体はスケジューラを内蔵しません。お好みの方法で `npm run check` を定期実行してください。

### GitHub Actions (作者の運用環境)

`.github/workflows/check.yml` を同梱しており、リポジトリにそのまま乗せるだけで動きます。

1. GitHub Secrets に `SMTP_PASSWORD` を登録
2. `config.yaml` を repo に commit するか (private repo 推奨)、`CONFIG_YAML` という Secret に YAML 文字列を入れる
3. Actions タブから手動キック、または6時間ごとの cron で自動実行

⚠️ スケジュール実行はリポジトリが60日間アクティブでないと自動的に無効化されます。コミット or 手動キックで定期的に活性を保ってください。

### macOS の launchd / cron

`examples/launchd/tdr.watcher.plist.example` か `examples/cron/crontab.example` を参考にしてください。

### Docker

`examples/docker/Dockerfile` と `docker-compose.yml.example` を同梱。

## 設計

詳細な設計書は `docs/superpowers/specs/2026-05-23-tdr-hotel-availability-watcher-design.md` を参照してください。

主要モジュール:

```
src/
  config/    - YAML読込、zod検証、初回ウィザード、プロバイダプリセット
  hotels/    - TDR 6ホテルの定数とURL生成
  fetcher/   - Playwrightでサイト巡回、純粋関数のパーサー、待機ページ対応、エラー分類
  renderer/  - インラインstyle HTMLレポート生成 (メーラー互換)
  notifier/  - nodemailer 経由のSMTP送信
  index.ts   - CLIエントリポイント
```

## ライセンス

MIT
