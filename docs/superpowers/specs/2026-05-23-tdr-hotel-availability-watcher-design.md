# TDR ホテル空き状況ウォッチャー 設計書

- 作成日: 2026-05-23
- 対象: 東京ディズニーリゾート (TDR) 直営6ホテルの予約状況を定期取得し、HTMLレポートを生成してメール送信するツール
- ライセンス想定: OSSとしてGitHub公開
- 動作確認環境: GitHub Actions (作者運用)、ローカルcron/launchd/Docker でも動作可能

## 1. ゴールと非ゴール

### 1.1 ゴール

- TDR公式予約サイト `reserve.tokyodisneyresort.jp` から、全6ホテル × 全部屋タイプ × 表示可能な全月の予約状況を1回の実行でまとめて取得する
- 取得結果を見やすいHTMLレポートに整形し、SMTP経由でメール本文（インラインHTML）として送信する
- GitHub公開を前提とし、誰でも `git clone` → `npm install` → `npm run check` で動作する状態にする

### 1.2 非ゴール

- 予約「行為」の自動化（=実際の予約決済まで進める機能）
- 差分検出・状態変化のトラッキング（毎回フル送信、変化検知なし）
- 「特定日に空いているホテルを絞り込む」「キーワード検索」等の付加機能（公式サイトでできる範囲のため）
- LINE等メール以外の通知チャネル（将来の拡張余地として設計に残すが、初期実装では対象外）
- TDR以外のリゾート（パリ、フロリダ等）対応

## 2. ユースケースと前提

### 2.1 ユーザー像

- TDRホテルの予約状況をこまめにチェックしたいが、公式サイトで1部屋1月ずつクリックして回るのが面倒な人
- メールで受け取って都合の良いタイミングで確認したい
- 個人利用想定、有料サービス（S3, SendGrid等）は使わない

### 2.2 トリガー

- ツール本体は `npm run check` という単一コマンドで1回分の取得＋通知を完結させる
- 定期実行はツール外部（cron / launchd / GitHub Actions等）の責務
- リポジトリには `.github/workflows/check.yml` を同梱し、Actions利用者がそのまま使える状態にする

### 2.3 検索条件

- 大人人数（18才〜、1〜15）、子ども人数（0〜15）、各子どもの年齢と寝方（添い寝/ベッド利用）、部屋数（1〜3）、泊数（1〜5）
- 上記の上限は部屋タイプにより変動する可能性があり、ランタイムでTDRが弾いた場合は該当部屋タイプ単位でエラー扱いする

## 3. 全体アーキテクチャ

4ステージのパイプライン構成。各ステージは独立してユニットテスト可能。

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Config  │───▶│ Fetcher  │───▶│ Renderer │───▶│ Notifier │
│  Loader  │    │ (worker  │    │  (HTML   │    │  (SMTP)  │
│          │    │  pool)   │    │ template)│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     ▲               │                │                │
     │               ▼                ▼                ▼
config.yaml    HotelSnapshot[]   HTML string      "送信完了"
     │
     └─ 初回起動時: 対話ウィザード → config.yaml 生成
```

| ステージ | 入力 | 出力 | 責務 |
|---|---|---|---|
| Config | コマンドライン引数 + config.yaml + .env | `Config` オブジェクト | 設定読み込み、zod検証、初回ウィザード |
| Fetcher | `Config` | `FullSnapshot` (= 全ホテル分の `HotelSnapshot[]`) | Playwrightで全ホテル × 全部屋 × 全月を巡回 |
| Renderer | `FullSnapshot` | HTML文字列 | Handlebarsテンプレート展開 |
| Notifier | HTML + Config | （送信） | nodemailer 経由のSMTP送信 |

## 4. ディレクトリ構成

```
disney-hotel-reservation/
├── README.md
├── package.json
├── tsconfig.json
├── .gitignore                  # config.yaml, .env, dist/, node_modules/ などを除外
├── config.example.yaml         # 公開用テンプレート
├── .env.example                # SMTP_PASSWORD のサンプル
│
├── src/
│   ├── index.ts                # CLI エントリポイント
│   │
│   ├── config/
│   │   ├── load.ts             # config.yaml + .env 読み込み + zod検証
│   │   ├── wizard.ts           # 初回起動時の対話ウィザード
│   │   ├── presets.ts          # メールプロバイダ別プリセット (Gmail/Yahoo等)
│   │   └── schema.ts           # Configのzodスキーマ
│   │
│   ├── hotels/
│   │   └── registry.ts         # TDR 6ホテルの定数 (hotelCode → 表示名)
│   │
│   ├── fetcher/
│   │   ├── index.ts            # public API: `fetchAll(config): Promise<FullSnapshot>`
│   │   ├── orchestrator.ts     # worker pool (直列/並列を吸収)
│   │   ├── fetchHotel.ts       # 1ホテル分を巡回するロジック
│   │   ├── parseCalendar.ts    # DOM → CalendarMonth の純粋関数
│   │   ├── parseRoomType.ts    # class属性 → (area, roomTypeName)
│   │   ├── classifyError.ts    # 例外/ページ状態 → ClassifiedError
│   │   └── waitingRoom.ts      # 待機ページ検出・自動待機
│   │
│   ├── renderer/
│   │   ├── index.ts            # `render(snapshot): string`
│   │   ├── template.hbs        # Handlebarsテンプレート (メールインライン用)
│   │   └── helpers.ts          # 日付・価格・状態のフォーマッタ
│   │
│   ├── notifier/
│   │   ├── index.ts            # `notify(html, config): Promise<void>`
│   │   └── smtp.ts             # nodemailer 経由のSMTP送信
│   │
│   └── types.ts                # 共有型 (HotelSnapshot, DayState など)
│
├── tests/
│   ├── parseCalendar.test.ts
│   ├── parseRoomType.test.ts
│   ├── classifyError.test.ts
│   ├── config.test.ts
│   ├── renderer.test.ts
│   └── fixtures/
│       ├── cells/              # セルレベルの HTML スニペット
│       │   ├── available.html
│       │   ├── limited.html
│       │   ├── full.html
│       │   ├── out_of_period.html
│       │   └── padding.html
│       └── months/             # 月全体の HTML
│           ├── 2026-06-DHM-capitano-superior.html
│           └── 2026-09-DHM-capitano-superior.html
│
├── examples/
│   ├── github-actions/check.yml.example
│   ├── cron/crontab.example
│   ├── launchd/tdr.watcher.plist.example
│   └── docker/{Dockerfile,docker-compose.yml.example}
│
└── .github/
    └── workflows/
        └── check.yml           # 動作する状態で同梱 (作者運用環境)
```

### 4.1 設計上の規約

- 各サブディレクトリには `index.ts` を置き、そのモジュールの公開APIを集約する（外部モジュール間のimportは原則 `index.ts` 経由）
- 同一モジュール内（例: `tests/parseCalendar.test.ts` から `src/fetcher/parseCalendar.ts`）は内部ファイル直接import可
- `parseCalendar.ts` は **Playwrightに依存しない純粋関数** (DOMParser使用)。Playwright無しでテスト可能
- `orchestrator.ts` が直列/並列の差分を完全に隠蔽。`fetchHotel.ts` は自身が直列か並列か知らない

## 5. データモデル (src/types.ts)

```ts
// ============ 1セル(1日)の状態 ============
export type DayState =
  | { kind: 'out_of_period' }                                 // 受付外 → 表示は '-'
  | { kind: 'available'; priceJpy: number }                   // ○
  | { kind: 'limited'; remaining: number; priceJpy: number }  // ①②③… 残部屋数表示
  | { kind: 'full' };                                         // ×（価格表示なし）

// ============ 1月分のカレンダー ============
export type CalendarMonth = {
  yearMonth: string;        // "2026-06"
  days: {
    date: number;           // 1〜31
    dayOfWeek: 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
    state: DayState;
  }[];
};

// ============ 1部屋タイプ × 表示可能な全月 ============
export type RoomTypeSnapshot = {
  hotelCode: string;        // "DHM" 等
  area: string;             // "トスカーナ・サイド" 等
  roomTypeName: string;     // "カピターノ・ミッキー・スーペリアルーム" 等
  months: CalendarMonth[];  // 空きありなしによらず取得できた全月
  error?: ClassifiedError;  // 取得失敗時のみセットされる
};

// ============ 1ホテル分のスナップショット ============
export type HotelSnapshot = {
  hotelCode: string;        // "DHM"
  hotelName: string;        // "東京ディズニーシー・ホテルミラコスタ"
  fetchedAt: Date;
  roomTypes: RoomTypeSnapshot[];
  error?: ClassifiedError;  // ホテル単位の失敗 (待機ページタイムアウト等)
};

// ============ 検索条件 (config.yaml の `search` に対応) ============
export type ChildAgeKey =
  | '0' | '1' | '2' | '3' | '4' | '5'
  | '6_preschool'        // 6才（未就学）
  | '6_elementary'       // 6才（小学生）
  | '7' | '8' | '9' | '10' | '11'
  | '12_elementary'      // 12才（小学生）
  | '12_middle'          // 12才（中学生）
  | '13_18_highschool';  // 13才〜18才（高校生）

export type ChildSleeping = 'co_sleep' | 'with_bed';

export type ChildGuest = {
  age: ChildAgeKey;
  sleeping: ChildSleeping;
};

export type SearchParams = {
  adults: number;            // 18才以上 (1〜15)
  children: ChildGuest[];    // 空配列 = 子ども0人
  rooms: number;             // 1〜3 (部屋タイプにより上限あり)
  nights: number;            // 1〜5 (同上)
};

// ============ 1回の実行で得られる全データ ============
export type FullSnapshot = {
  fetchedAt: Date;
  searchParams: SearchParams;
  visibleMonthRange: { from: string; to: string };  // "2026-05" 〜 "2026-09"
  hotels: HotelSnapshot[];
};

// ============ エラー分類 ============
export type ClassifiedError =
  | { kind: 'guest_limit_exceeded'; message: string }
  | { kind: 'room_not_searchable'; message: string }
  | { kind: 'waiting_room_timeout'; message: string }
  | { kind: 'bot_detected'; message: string }
  | { kind: 'navigation_timeout'; message: string }
  | { kind: 'parse_failure'; message: string; htmlSnippet: string }
  | { kind: 'unknown'; message: string; stack?: string };
```

### 5.1 バリデーションルール

- `adults >= 1`（最低1人の大人が必要）
- `children[i].age` は `ChildAgeKey` の値のいずれか
- `rooms >= 1, nights >= 1`
- `co_sleep` は `'12_middle'` と `'13_18_highschool'` には不可（TDRのフォーム制約と一致）
- 静的バリデーションで防げない上限超過（部屋タイプ別の人数/部屋/泊数上限）はランタイムでTDRが弾くので、`classifyError` で部屋タイプ単位のエラーに振り分ける

## 6. TDR サイトの遷移フロー (実地調査結果)

実際にPlaywrightで確認した遷移と DOM 構造を確定事項として記載する。

### 6.1 ホテルコード

| code | 正式名 |
|---|---|
| FSH | 東京ディズニーシー・ファンタジースプリングスホテル |
| TDH | 東京ディズニーランドホテル |
| DAH | ディズニーアンバサダーホテル |
| DHM | 東京ディズニーシー・ホテルミラコスタ |
| TSH | 東京ディズニーリゾート・トイ・ストーリーホテル |
| DCH | 東京ディズニーセレブレーションホテル |

### 6.2 遷移ステップ

```
[1] ホテル詳細ページへ直接アクセス
    URL: https://reserve.tokyodisneyresort.jp/hotel/list/
         ?searchHotelCD=<CODE>&displayType=hotel-search
    待機ページが出る場合はここで遷移する場合あり (handleWaitingRoom 経由)
       ↓
[2] ページに当該ホテルの全部屋タイプが縦に並ぶ
    各部屋の「客室の空き状況を確認する」リンクのセレクタ:
      a.js-callVacancyStatusSearch
    class属性に「エリア名」「部屋タイプ名」が直接埋め込まれている:
      class="button next js-callVacancyStatusSearch トスカーナ・サイド カピターノ・ミッキー・スーペリアルーム"
       ↓ クリック (ページ遷移なし、JSモーダルが開く)
[3] モーダル: 検索条件入力フォーム (#js-vacancyModal)
    フィールド:
      #adultNumVacancy   - 大人 (0〜15)
      #childNumVacancy   - 子ども (0〜15、>0で年齢/寝方フィールドが動的追加)
      #roomsNumVacancy   - 部屋数 (1〜3、部屋タイプにより上限変動)
      #stayDaysVacancy   - 泊数 (1〜5、同上)
    「次へ」: a.next.js-conditionHide
       ↓ クリック (同一モーダル内で次のステップへ)
[4] 同一モーダル内でカレンダー画面に切り替わる
    月セレクタ: select#boxCalendarSelect
    値の形式: "YYYY,M" (例: "2026,6")、初期値は "blank"
    表示可能な月のオプション一覧から、巡回対象の月を全て列挙できる
    カレンダー本体: table.vacancyCalTable (8行 × 7列)
       ↓ #boxCalendarSelect で月を切り替えるとカレンダーが再描画される
[5] 1部屋タイプの全月を取得し終えたらモーダルを閉じ、次の部屋タイプの[2]に戻る
```

### 6.3 カレンダーセルの状態マッピング

| 表示 | tdクラス | ddクラス | 中身 | DayState |
|---|---|---|---|---|
| **○ + 価格** | `cal_YYYYMMDD ok` | `calendarImage` | `<img ico_state_13.png>` + `<em>{price}円</em>` | `available` |
| **数字 + 価格** | `cal_YYYYMMDD ok` | `calendarImage few` | `<span>{N}</span>` + `<em>{price}円</em>` | `limited` |
| **×** | `cal_YYYYMMDD` | `calendarImage vMiddle` | `<img ico_state_14.png>` | `full` |
| **-** | `cal_YYYYMMDD outsideSaleDays` | `calendarImage vMiddle` | `<span>-</span>` | `out_of_period` |
| **空白** | `td_X` (cal_ なし) | `calendarImage` | `&nbsp;` | パディング (parser でスキップ) |

### 6.4 表示可能期間

- 今日を起点に約5ヶ月先まで（2026/5/23時点で 2026/5〜2026/9）
- 部屋タイプにより微妙に異なる可能性があるため、`#boxCalendarSelect` のoptionから動的に取得する

### 6.5 待機ページ

- TDRサイト全体が混雑時に「順番にご案内します」系の待機ページに遷移する
- 検出ロジック: URL や特定文言の存在で判定する `isWaitingPage(page)` を実装
- 自動更新で待機解除されるため、リロード不要。30秒ごとにページ状態を確認し、最大30分待機（設定で変更可能）

## 7. Fetcher の擬似コード

```ts
async function fetchHotel(
  hotel: HotelDef,
  search: SearchParams,
  ctx: BrowserContext
): Promise<HotelSnapshot> {
  const page = await ctx.newPage();
  try {
    await page.goto(
      `https://reserve.tokyodisneyresort.jp/hotel/list/?searchHotelCD=${hotel.code}&displayType=hotel-search`
    );
    await handleWaitingRoom(page);

    const roomLinks = await page.$$('a.js-callVacancyStatusSearch');
    const roomSnapshots: RoomTypeSnapshot[] = [];

    for (const link of roomLinks) {
      const classes = await link.getAttribute('class');
      const { area, roomTypeName } = parseRoomTypeFromClasses(classes);

      try {
        await link.click();
        await page.waitForSelector('#js-vacancyModal:visible');

        await fillSearchForm(page, search);
        await page.click('a.next.js-conditionHide');
        await page.waitForSelector('select#boxCalendarSelect');

        // 表示可能な全月をオプション一覧から取得
        const monthOptions = await page.$$eval(
          '#boxCalendarSelect option',
          opts => opts.map(o => o.value).filter(v => v !== 'blank')
        );

        const months: CalendarMonth[] = [];
        for (const monthValue of monthOptions) {
          await page.selectOption('#boxCalendarSelect', monthValue);
          await page.waitForFunction(() =>
            !!document.querySelector('table.vacancyCalTable td[class*="cal_"]')
          );
          const html = await page.$eval('table.vacancyCalTable', el => el.outerHTML);
          months.push(parseCalendar(html, monthValue));
        }

        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months,
        });
      } catch (e) {
        roomSnapshots.push({
          hotelCode: hotel.code,
          area,
          roomTypeName,
          months: [],
          error: classifyError(e, page),
        });
      } finally {
        // モーダルを閉じて次の部屋タイプへ
        await closeModal(page);
      }
    }

    return {
      hotelCode: hotel.code,
      hotelName: hotel.name,
      fetchedAt: new Date(),
      roomTypes: roomSnapshots,
    };
  } finally {
    await page.close();
  }
}
```

### 7.1 オーケストレータ（直列/並列）

```ts
async function fetchAll(config: Config): Promise<FullSnapshot> {
  const browser = await chromium.launch();
  try {
    const targetHotels = config.fetch.hotels.map(code => HOTELS_BY_CODE[code]);
    const queue = [...targetHotels];
    const concurrency = config.fetch.concurrency;

    const workers = Array(concurrency).fill(null).map(async (_, workerId) => {
      const ctx = await browser.newContext();
      const results: HotelSnapshot[] = [];
      try {
        while (queue.length > 0) {
          const hotel = queue.shift();
          if (!hotel) break;
          log.info(`[worker-${workerId}] ${hotel.code} 取得開始`);
          try {
            results.push(await fetchHotel(hotel, config.search, ctx));
          } catch (e) {
            results.push({
              hotelCode: hotel.code,
              hotelName: hotel.name,
              fetchedAt: new Date(),
              roomTypes: [],
              error: classifyError(e),
            });
          }
        }
      } finally {
        await ctx.close();
      }
      return results;
    });

    const hotels = (await Promise.all(workers)).flat();
    return {
      fetchedAt: new Date(),
      searchParams: config.search,
      visibleMonthRange: computeVisibleMonthRange(hotels),
      hotels,
    };
  } finally {
    await browser.close();
  }
}
```

### 7.2 パーサー (純粋関数)

```ts
export function parseCalendar(tableHtml: string, monthValue: string): CalendarMonth {
  const [year, month] = monthValue.split(',').map(Number);
  const doc = new DOMParser().parseFromString(tableHtml, 'text/html');
  const days: CalendarMonth['days'] = [];

  doc.querySelectorAll('td').forEach(td => {
    const match = td.className.match(/cal_(\d{4})(\d{2})(\d{2})/);
    if (!match) return; // パディングセル
    const dateNum = parseInt(match[3]);
    const state = parseDayState(td);
    days.push({
      date: dateNum,
      dayOfWeek: dayOfWeekFromTdClass(td.className),
      state,
    });
  });

  return {
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
    days,
  };
}

function parseDayState(td: Element): DayState {
  if (td.className.includes('outsideSaleDays')) {
    return { kind: 'out_of_period' };
  }
  const dd = td.querySelector('dd.calendarImage');
  if (dd?.classList.contains('few')) {
    const remaining = parseInt(dd.querySelector('span')!.textContent!.trim());
    const priceJpy = parsePrice(dd.querySelector('em.minimumAmount')!.textContent!);
    return { kind: 'limited', remaining, priceJpy };
  }
  const img = dd?.querySelector('img');
  const src = img?.getAttribute('src') ?? '';
  if (src.includes('state_13')) {
    const priceJpy = parsePrice(dd!.querySelector('em.minimumAmount')!.textContent!);
    return { kind: 'available', priceJpy };
  }
  if (src.includes('state_14')) {
    return { kind: 'full' };
  }
  throw new Error(`Unknown cell state: ${td.outerHTML.slice(0, 200)}`);
}
```

## 8. レポート設計

### 8.1 出力方針

- **フィルタ**: `available (○)` と `limited (①②③…)` のみ表示。`full (×)` と `out_of_period (-)` は出さない
- **グルーピング**: 単一構造で固定 (ホテル → エリア → 部屋タイプ → 空きのある日付一覧)
- **全期間空きなしの部屋タイプ**: 末尾の「📭 全期間空きなしの部屋タイプ」セクションに行名だけ列挙
- **取得エラー**: 末尾の「⚠️ 取得エラー」セクションに列挙

### 8.2 レイアウト

```
🏰 TDRホテル空き状況レポート
取得日時: 2026/05/23 23:45
検索条件: 大人2名 / 子ども0名 / 1泊 / 1部屋
表示可能期間: 2026/05/24 〜 2026/09/30

──────────────────────
🏨 ディズニーアンバサダーホテル
──────────────────────
  ▸ スーペリアルーム (山側)
    2026/06/15 (月)  ○  43,000円〜
    2026/06/16 (火)  ○  43,000円〜
    2026/07/03 (金)  ② 残2  48,000円〜

  ▸ ミッキーマウスルーム
    2026/09/05 (土)  ① 残1  85,000円〜

──────────────────────
🏨 東京ディズニーシー・ホテルミラコスタ
──────────────────────
  ...

📭 全期間空きなしの部屋タイプ
  - DHM トスカーナ・サイド カピターノ・ミッキー・トリプルルーム
  - DHM ヴェネツィア・サイド スーペリアルーム
  - TDH コンシェルジュ ターレットスイート
  ... (合計N件)

⚠️ 取得エラー (もしあれば)
  - DHM ヴェネツィア・スイート: 検索条件不可（人数上限超過の可能性）
```

### 8.3 HTMLスタイル方針

メールクライアントの制約に合わせる:

- すべて **インラインstyle** (外部CSSや`<style>`タグは剥がされるため)
- レイアウトは **`<table>`** で組む (display:flex/grid 非対応のクライアントあり)
- **TDRの画像 (state_13/14.png 等) は使用せず**、`○ × ①` をテキスト/CSSで再現
- 1行（1空き日）の構造:

```html
<tr>
  <td style="padding:6px 12px;font-family:monospace;">2026/06/15 (月)</td>
  <td style="color:#2e7d32;font-size:18px;">○</td>
  <td style="padding:6px 12px;">43,000円〜</td>
</tr>
```

### 8.4 出力先

- **メール本文**: そのままインラインHTML
- **ファイル保存**: `reports/YYYY-MM-DDTHH-MM-SS.html` にも書き出し（オフライン閲覧用、`config.report.save_to_file` で制御）

### 8.5 テンプレートエンジン

- Handlebars 採用（軽量、TS互換、ヘルパー登録が容易）
- ヘルパー: `formatYearMonthDay(date)`, `formatPrice(jpy)`, `dayStateLabel(state)` 等

## 9. config.yaml と初回ウィザード

### 9.1 config.yaml 最終仕様

```yaml
# 検索条件
search:
  adults: 2                    # 18才以上 (1〜15)
  children: []                 # 子どもなし (詳細形式は下記コメント参照)
  rooms: 1                     # 部屋数 (1〜3)
  nights: 1                    # 泊数 (1〜5)

# 子ども入りの例:
# search:
#   children:
#     - age: '5'             # ChildAgeKey
#       sleeping: with_bed   # co_sleep | with_bed

# 取得設定
fetch:
  concurrency: 1               # 1 = 直列(デフォルト), 2-5 = 並列。範囲外はzod検証でエラー
  waiting_room:
    enabled: true
    max_wait_minutes: 30
  hotels:                      # 監視対象ホテル (省略時は全6)
    - FSH
    - TDH
    - DAH
    - DHM
    - TSH
    - DCH

# メール送信
smtp:
  provider: gmail              # gmail | yahoo | outlook | icloud | other
  from: your-address@gmail.com
  to:
    - your-email@example.com   # 複数指定可
  subject_template: 'TDRホテル空き状況 {{date}} {{time}}'
  # provider: other の場合のみ以下を追加で記述
  # host: smtp.example.com
  # port: 587
  # secure: false

# レポート出力
report:
  save_to_file: true           # reports/ ディレクトリにも保存
  output_dir: ./reports

# 異常時の挙動
behavior:
  notify_on_total_failure: false   # 1件もデータが取れなかった時にメールするか
```

### 9.2 .env

```bash
# nodemailer 経由のSMTP認証用 (.gitignore対象)
SMTP_PASSWORD=
```

### 9.3 初回ウィザード

- 起動時に `config.yaml` が無ければ自動でウィザード起動
- プロバイダーをプリセット化し、host/port/secure はユーザー入力不要
- パスワードは隠し入力で受け取り、`.env` に `SMTP_PASSWORD=...` の形で自動書き込み
- Gmail選択時はアプリパスワード発行URLを案内
- 必要に応じて確認・キャンセル可能

### 9.4 コマンド

| コマンド | 動作 |
|---|---|
| `npm run check` | 通常実行。`config.yaml` が無ければ自動でウィザード起動 |
| `npm run setup` | 強制的にウィザード起動。既存の `config.yaml` は `config.yaml.bak.YYYYMMDD-HHMMSS` にバックアップしてから新規生成。「全上書き」と「現在値をデフォルトに引き継いで一部変更」の2モード |
| `npm run reset` | 確認プロンプト後に `config.yaml` と `.env` を削除（クリーンスタート用） |

## 10. エラーハンドリング

### 10.1 カテゴリと握りつぶし境界

| カテゴリ | 例 | 握りつぶし境界 | リトライ | レポート反映 |
|---|---|---|---|---|
| 設定エラー | YAML不正、必須欠落、`adults<1` | 全体停止 (zod検証で早期エラー) | なし | 起動時にコンソール出力 |
| TDRサイトダウン | TOPページが500/タイムアウト | 全体停止 | 3回 (30s/60s/120s) | 失敗時は終了コード非0、`notify_on_total_failure: true` のときのみメール送信 |
| 待機ページ長時間 | 30分超え | 該当ホテル単位 | なし | 「⚠️ FSH 待機ページから抜けられず」 |
| ホテル単位失敗 | ホテルページのロード失敗、ボット検出 | 該当ホテル単位 | 1回 | 「⚠️ DHM ページ取得失敗 (詳細)」 |
| 部屋タイプ単位失敗 | 人数上限超過、検索条件不可 | 該当部屋タイプ単位 | なし | エラー分類表示 |
| 月単位失敗 | 特定月のセル読み込みタイムアウト | 該当月単位 | 1回 | 「⚠️ 2026/08 取得失敗」 |
| パース失敗 | 想定外のDOM（TDR改修等） | 該当セル/月 | なし | スタックトレース + HTMLスニペットをログ保存 |

### 10.2 リトライ実装

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; baseMs: number; onRetry?: (e: Error, attempt: number) => void }
): Promise<T> {
  let lastErr: Error;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      opts.onRetry?.(lastErr, i + 1);
      if (i < opts.attempts - 1) {
        await sleep(opts.baseMs * Math.pow(2, i));
      }
    }
  }
  throw lastErr!;
}
```

### 10.3 ログ戦略

- 標準出力: `[worker-1] DHM トスカーナ・サイド スーペリアルーム 取得開始` 形式 (GH Actions ログで追跡可能)
- ファイル出力: `logs/run-YYYY-MM-DDTHH-MM-SS.log` に詳細
- パースエラー時: `logs/parse-failures/` にHTMLスニペット保存（後で fixture として再利用可能）

## 11. テスト戦略

| レイヤー | 種類 | 何をテストするか | 実行タイミング |
|---|---|---|---|
| parseCalendar | ユニット | 5パターンのセル状態 → DayState正しく変換 | 毎回 (CI) |
| parseRoomType | ユニット | class属性 → (area, roomTypeName) | 毎回 (CI) |
| classifyError | ユニット | 既知エラー文言/型 → ClassifiedError | 毎回 (CI) |
| config/load | ユニット | 正常YAML、不正YAML、必須欠落 | 毎回 (CI) |
| renderer | スナップショット | 固定 FullSnapshot → 期待HTML | 毎回 (CI) |
| fetcher (smoke) | インテグレーション | 1ホテル1部屋を実際に取得して shape を検証 | 手動 or 週1 (`TEST_INTEGRATION=1`) |
| TypeScript型 | 型 | `tsc --noEmit` | 毎回 (CI) |

### 11.1 フィクスチャ

調査で得られた実HTMLスニペットを `tests/fixtures/` に保存:

- `tests/fixtures/cells/{available,limited,full,out_of_period,padding}.html`
- `tests/fixtures/months/2026-06-DHM-capitano-superior.html` 等

## 12. 配布とデプロイ

### 12.1 リポジトリ構造の意図

- `config.example.yaml` と `.env.example` を同梱、本物の `config.yaml` / `.env` は `.gitignore`
- `examples/` ディレクトリに各環境向けのスケジューラ設定例を同梱
- `.github/workflows/check.yml` は **作者の運用環境で動作する状態** で同梱

### 12.2 利用フロー (Quick Start)

```bash
git clone https://github.com/<user>/disney-hotel-reservation.git
cd disney-hotel-reservation
npm install
npx playwright install chromium

# 初回はウィザードが起動
npm run check
```

### 12.3 GitHub Actions での運用

- `.github/workflows/check.yml` は cron (例: 6時間ごと) + workflow_dispatch (手動実行) を設定
- Secrets に `SMTP_PASSWORD` を登録 (それ以外の設定は `config.yaml` 経由)
- 注意: スケジュール実行はリポジトリ非アクティブ60日で自動停止する仕様があるため、定期的な手動キックや空コミットで回避

### 12.4 想定動作環境

| 環境 | サポート状況 |
|---|---|
| GitHub Actions (ubuntu-latest) | 作者運用予定環境 (workflow 同梱) |
| macOS (cron / launchd) | examples 同梱、動作想定 |
| Linux (cron / systemd) | examples 同梱、動作想定 |
| Windows (タスクスケジューラ) | examples 同梱、動作想定 |
| Docker | examples 同梱、動作想定 |

## 13. 非機能要件

実装後に実測で再評価する想定。

| 項目 | 推定値・目標 |
|---|---|
| 1回あたり実行時間 (直列) | 全6ホテル巡回で 20〜40分（推定、待機ページ含めない理想ケース） |
| 1回あたり実行時間 (並列3) | 10〜20分（推定、非ピーク時） |
| メールサイズ | 50〜200KB（推定、空き表示のみフィルタ前提） |
| GitHub Actions 利用枠 | public repoなら完全無料・無制限 |
| 失敗率の許容範囲 | 個別ホテル失敗が10%以下、部分結果でもレポート送信できる構造を維持 |

## 14. 将来の拡張余地（初期スコープ外、設計に残す）

- LINE / Discord / Slack 等のメール以外のチャネル → Notifier を差し替え可能な抽象に分離済み
- 差分検知（前回スナップショットとの diff） → Fetcher の出力 FullSnapshot をJSON保存しておけば後付け可能
- 公式以外（パートナーホテル等）への対応 → `hotels/registry.ts` の拡張で対応可能
- TDRバケーションパッケージの取得 → 別の Fetcher を追加する形で拡張可能
