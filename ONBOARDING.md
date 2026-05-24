# はじめての方向け セットアップ手順

東京ディズニーリゾート (TDR) ホテル空き状況ウォッチャーを最初から動かすための手順書です。所要時間は 15〜30 分。

## 前提

- macOS / Linux / Windows のいずれか
- ターミナルを開ける、Git と Node.js を使える方
- メール送信用のアドレス (Gmail / Yahoo!メール / Outlook / iCloud のいずれか、もしくは他の SMTP)
- 1ホテル取得に 30〜60 分かかるので、PC をスリープさせず置いておける時間帯

## 1. 必要なものをインストール

### 1-1. Node.js (v20以上)

```bash
node --version  # v20.x.x 以上ならOK
```

入っていない、もしくは古い場合は [Node.js 公式](https://nodejs.org/) から最新の LTS をインストール。

### 1-2. Git

```bash
git --version  # 入っていれば OK
```

入っていなければ macOS は `xcode-select --install`、Windows は [Git for Windows](https://gitforwindows.org/)。

## 2. リポジトリを取得

```bash
git clone https://github.com/mkenhub/disney-hotel-reservation.git
cd disney-hotel-reservation
npm install
```

## 3. Playwright のブラウザを取得

```bash
npx playwright install chromium
```

200MB ほどダウンロードされます。

## 4. Gmail を使う場合: アプリパスワードを発行

⚠️ 通常のログインパスワードは使えません。Gmail はアプリ用に発行する 16桁の「アプリパスワード」を要求します。

1. Google アカウントの **2段階認証** を有効化していなければ先に有効化
   - https://myaccount.google.com/security
2. **アプリパスワード発行ページ** を開く
   - https://myaccount.google.com/apppasswords
3. アプリ名 (例: `TDR Watcher`) を入力 → 「作成」
4. 表示される **16桁のパスワード** をコピー (スペースは無視してよい)

Yahoo / iCloud / Outlook を使う場合も、それぞれのアプリパスワード機能を使ってください。手順は各サービスのヘルプを参照。

## 5. 初回起動 (対話ウィザード)

```bash
npm run check
```

`config.yaml` が無いと自動的にセットアップウィザードが起動します。質問に順に答えていってください。

### 質問の例

```
=== TDR ホテル空き状況ウォッチャー 初回セットアップ ===

--- 検索条件 ---
? 大人の人数 (18才以上)  2
? 子どもの人数  2

  子ども1人目:
  ? 年齢  5才
  ? 寝方
    ❯ 添い寝 (co_sleep)
      ベッド利用 (with_bed)

  子ども2人目:
  ? 年齢  2才
  ? 寝方  添い寝 (co_sleep)

? 部屋数  1
? 泊数  1

--- 監視対象ホテル ---
? チェックを外すと監視対象から除外されます (Space で切替)
  ◉ FSH 東京ディズニーシー・ファンタジースプリングスホテル
  ◉ TDH 東京ディズニーランドホテル
  ◉ DAH ディズニーアンバサダーホテル
  ◉ DHM 東京ディズニーシー・ホテルミラコスタ
  ◉ TSH 東京ディズニーリゾート・トイ・ストーリーホテル
  ◉ DCH 東京ディズニーセレブレーションホテル

? 並列度 (1=直列推奨、2-5=並列)  1

--- メール送信設定 ---
? メール送信に使うサービス
  ❯ Gmail (Googleアカウント)
    Yahoo!メール
    Outlook.com / Hotmail
    iCloud
    その他 (手動でSMTP設定)

⚠️  Gmail を使う場合は通常のパスワードではなく「アプリパスワード」が必要です。
   発行URL: https://myaccount.google.com/apppasswords (2段階認証ON必須)

? 送信元メールアドレス  your-email@gmail.com
? 送信先メールアドレス (カンマ区切りで複数可)  your-email@gmail.com
? メール送信用パスワード (隠し入力)  ****************

--- 入力内容確認 ---
大人: 2名 / 子ども: 2名 / 部屋数: 1 / 泊数: 1
監視ホテル: FSH, TDH, DAH, DHM, TSH, DCH
並列度: 1
SMTP: gmail / from=your-email@gmail.com / to=your-email@gmail.com
? 上記でファイルを生成しますか？  Yes

✓ config.yaml を生成しました
✓ .env を生成しました (SMTP_PASSWORD設定済み)

セットアップ完了。`npm run check` で取得を実行できます。
```

`config.yaml` と `.env` が作られます (この2つは `.gitignore` 対象なので git には含まれません)。

## 6. 取得実行

```bash
npm run check
```

ログがリアルタイムで流れます:

```
=== TDR ホテル空き状況取得を開始 ===
対象ホテル: FSH, TDH, DAH, DHM, TSH, DCH
並列度: 1
headless: false
[worker-0] FSH navigate https://reserve.tokyodisneyresort.jp/...
[worker-0] FSH   ↳ networkidle 待機 (最大30s)
[worker-0] FSH 部屋タイプ: 28件
[worker-0] FSH [1/28] ファンタジーシャトー / ベイエリアサイド スーペリアルーム
...
=== 取得完了: 6 ホテル ===
📄 レポートをファイル保存: reports/report-2026-05-24T15-00-00.html
📧 メール送信中... to=your-email@gmail.com
✓ メール送信完了 (サマリー本文 + 詳細HTML添付)
```

途中で **Chromium のブラウザウィンドウが画面に出ます** (TDR がヘッドレスモードをブロックしているため)。閉じないように。

### 所要時間の目安

| ホテル数 | 推定 |
|---|---|
| 1ホテル (28部屋程度) | 30〜60分 |
| 全6ホテル (約165部屋) | 1.5〜3時間 |

混雑時 (TDR の Akamai キュー発動) は + 数十分。

## 7. メールを確認

届くメールは:
- **本文**: ホテルごとの空き部屋数 1行サマリー (Gmail でも読める軽量版)
- **添付**: アコーディオン式の詳細レポート (`tdr-report-<timestamp>.html`)

添付HTMLをダウンロードしてブラウザで開くと:
- ホテル単位で `▶` をクリック → 展開
- 部屋タイプ単位で `▶` をクリック → 日付ごとの空き状況一覧 (価格付き)

## 8. 定期実行に切り替える (任意)

ツール本体はスケジューラを内蔵していません。お好みの方法で `npm run check` を定期実行してください。

### GitHub Actions

`.github/workflows/check.yml` がリポジトリに同梱済み。

1. GitHub 上のリポジトリ Settings → Secrets and variables → Actions
2. `SMTP_PASSWORD` を新規追加 (上で発行したアプリパスワードを貼り付け)
3. `config.yaml` の中身をそのまま `CONFIG_YAML` という名前で Secret に追加 (public repo に個人情報を残したくない場合のみ。private fork なら commit してもOK)
4. Actions タブから手動キック、もしくは 6時間ごとの cron で自動実行

⚠️ スケジュール実行はリポジトリが60日間アクティビティ無しだと自動的に無効化されます。たまにコミット or 手動キックを。

### macOS の launchd

`examples/launchd/tdr.watcher.plist.example` を参考に。

### Linux の cron

`examples/cron/crontab.example` を参考に。

### Docker

`examples/docker/Dockerfile` と `docker-compose.yml.example` を参考に。

## 9. 設定の再変更

| やりたいこと | コマンド |
|---|---|
| 設定を変えたい (ウィザード再実行) | `npm run setup` (既存 config.yaml は自動でバックアップ) |
| 全部消してやり直し | `npm run reset -- --confirm` |
| 設定ファイルを直接編集 | `config.yaml` をテキストエディタで編集 |
| パスワードだけ変えたい | `.env` の `SMTP_PASSWORD=` を編集 |

## 10. うまく行かない時

| 症状 | 確認・対処 |
|---|---|
| 「config.yaml が見つかりません」のままウィザードが出ない | 古い Node.js を使っている可能性。`node --version` で v20以上を確認 |
| メール送信失敗 (`535 Authentication Failed`) | Gmail のアプリパスワードが正しいか、コピペ時にスペースを含めていないかを確認 |
| `ERR_TIMED_OUT` で全ホテル失敗 | TDR がヘッドレスをブロックしているはず。`config.yaml` の `fetch.headless: false` (デフォルト) を確認 |
| 待機ページから抜けられない | TDR が深夜メンテ中の可能性。1〜2時間後に再実行 |
| 価格パースエラーが続出 | TDR の表記が変わった可能性。Issue を立てて報告お願いします |

## おまけ: 設計書

実装の細部 (TDR の挙動、修正履歴) は `docs/superpowers/specs/2026-05-23-tdr-hotel-availability-watcher-design.md` を参照。実装中に発見した知見が §6 にまとめてあります。
