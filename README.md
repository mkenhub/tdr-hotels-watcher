# TDR ホテル空き状況ウォッチャー

東京ディズニーリゾート (TDR) 直営6ホテル × 全部屋タイプ × 表示可能な全月 (今日を起点に約5ヶ月先まで) の予約状況をまとめて取得し、空きがある日付だけを HTML レポートにしてメール送信するツールです。

公式予約サイト [reserve.tokyodisneyresort.jp](https://reserve.tokyodisneyresort.jp/) は1部屋1月ずつしかカレンダーを確認できません。このツールはそれを**1回の実行で全部まとめてプッシュ通知**してくれます。

## 機能概要

- 対象: ディズニーホテル ミラコスタ / ランドホテル / アンバサダー / ファンタジースプリングス / トイ・ストーリー / セレブレーション の6ホテル
- 取得対象: 各ホテルの全部屋タイプ × 表示可能な全月 (5ヶ月分、各ホテル約28部屋タイプ)
- 出力: 「空きあり (○)」「残少 (残N)」のみを抽出した HTML レポート
  - **メール本文**: ホテルごとの空き部屋数を1行で示す軽量サマリー (~3KB)
  - **添付**: アコーディオン式の詳細レポート (ブラウザで開くと開閉可能)
- 「満室 (×)」「受付外 (-)」は省略 (情報量を絞って読みやすく保つ)
- ホテル単位 / 部屋タイプ単位 / 月単位でエラーを握りつぶし、部分結果でもレポートを送る設計
- TDR 混雑時の Akamai TVC キューを自動検出・待機 (最大30分)

## 必要環境

- Node.js 20以上
- メール送信用の SMTP アカウント (Gmail / Yahoo / Outlook / iCloud / その他)
- **ヘッドレス無しで動くデスクトップ環境** (TDR は TLS フィンガープリント層で headless Chromium をブロックするため、ヘッドレスでは動かない)

## 既知の制約

- **実行時間**: 1ホテルあたり約 10〜15分 (28部屋 × 5ヶ月、Akamaiキュー待ちを含む)。全6ホテルだと約 1〜2時間
- **TDR は data-center IP からのアクセスを Akamai でブロック** している。実行するマシンは家庭/オフィス回線などの一般的な ISP 経由が必要。クラウド (AWS/GCP/Azure 等) や CI ホスティングからは Access Denied になる
- **メーラ内アコーディオン**: Gmail は `<details>` のインタラクティブ動作を本文では無効化する。詳細を見たい時は添付HTMLをブラウザで開く

## クイックスタート (ローカル実行)

```bash
git clone https://github.com/mkenhub/tdr-hotels-watcher.git
cd tdr-hotels-watcher
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

### macOS

`examples/launchd/tdr.watcher.plist.example` (launchd) もしくは `examples/cron/crontab.example` を参考にしてください。

### Linux

`examples/cron/crontab.example` の `cd` パスを書き換えて使ってください。

### Docker

`examples/docker/Dockerfile` と `docker-compose.yml.example` を同梱しています (ただしホスト側が data-center IP の場合 TDR にブロックされる点に注意)。

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
