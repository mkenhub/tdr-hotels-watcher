// ============ 1セル(1日)の状態 ============
export type DayState =
  | { kind: 'out_of_period' } // 受付外 → 表示は '-'
  | { kind: 'available'; priceJpy: number } // ○
  | { kind: 'limited'; remaining: number; priceJpy: number } // ①②③… 残部屋数表示
  | { kind: 'full' }; // ×（価格表示なし）

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// ============ 1月分のカレンダー ============
export type CalendarMonth = {
  yearMonth: string; // "2026-06"
  days: {
    date: number; // 1〜31
    dayOfWeek: DayOfWeek;
    state: DayState;
  }[];
};

// ============ 1部屋タイプ × 表示可能な全月 ============
export type RoomTypeSnapshot = {
  hotelCode: string;
  area: string; // "トスカーナ・サイド"
  roomTypeName: string; // "カピターノ・ミッキー・スーペリアルーム"
  months: CalendarMonth[];
  error?: ClassifiedError; // 取得失敗時のみセット
};

// ============ 1ホテル分のスナップショット ============
export type HotelSnapshot = {
  hotelCode: string;
  hotelName: string;
  fetchedAt: Date;
  roomTypes: RoomTypeSnapshot[];
  error?: ClassifiedError;
};

// ============ 検索条件 (config.yaml の `search` に対応) ============
export const CHILD_AGE_KEYS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6_preschool',
  '6_elementary',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12_elementary',
  '12_middle',
  '13_18_highschool',
] as const;

export type ChildAgeKey = (typeof CHILD_AGE_KEYS)[number];

export const CHILD_AGE_LABELS: Record<ChildAgeKey, string> = {
  '0': '0才',
  '1': '1才',
  '2': '2才',
  '3': '3才',
  '4': '4才',
  '5': '5才',
  '6_preschool': '6才（未就学）',
  '6_elementary': '6才（小学生）',
  '7': '7才',
  '8': '8才',
  '9': '9才',
  '10': '10才',
  '11': '11才',
  '12_elementary': '12才（小学生）',
  '12_middle': '12才（中学生）',
  '13_18_highschool': '13才〜18才（高校生）',
};

/** ChildAgeKey → TDR の年齢 select の value 値 */
export const CHILD_AGE_TDR_VALUE: Record<ChildAgeKey, string> = {
  '0': '00',
  '1': '01',
  '2': '02',
  '3': '03',
  '4': '04',
  '5': '05',
  '6_preschool': '06D',
  '6_elementary': '06U',
  '7': '07',
  '8': '08',
  '9': '09',
  '10': '10',
  '11': '11',
  '12_elementary': '12D',
  '12_middle': '12U',
  '13_18_highschool': '13',
};

/** co_sleep (添い寝) が選択不可な年齢キー */
export const CO_SLEEP_FORBIDDEN_AGES: ReadonlySet<ChildAgeKey> = new Set([
  '12_middle',
  '13_18_highschool',
]);

export type ChildSleeping = 'co_sleep' | 'with_bed';

export type ChildGuest = {
  age: ChildAgeKey;
  sleeping: ChildSleeping;
};

export type SearchParams = {
  adults: number; // 18才以上 (1〜15)
  children: ChildGuest[]; // 空配列 = 子ども0人
  rooms: number; // 1〜3
  nights: number; // 1〜5
};

// ============ 1回の実行で得られる全データ ============
export type FullSnapshot = {
  fetchedAt: Date;
  searchParams: SearchParams;
  visibleMonthRange: { from: string; to: string }; // "2026-05" 〜 "2026-09"
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
