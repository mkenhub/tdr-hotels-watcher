export type HotelCode = 'FSH' | 'TDH' | 'DAH' | 'DHM' | 'TSH' | 'DCH';

export type HotelDef = {
  code: HotelCode;
  name: string;
};

export const HOTELS: readonly HotelDef[] = [
  { code: 'FSH', name: '東京ディズニーシー・ファンタジースプリングスホテル' },
  { code: 'TDH', name: '東京ディズニーランドホテル' },
  { code: 'DAH', name: 'ディズニーアンバサダーホテル' },
  { code: 'DHM', name: '東京ディズニーシー・ホテルミラコスタ' },
  { code: 'TSH', name: '東京ディズニーリゾート・トイ・ストーリーホテル' },
  { code: 'DCH', name: '東京ディズニーセレブレーションホテル' },
] as const;

export const HOTELS_BY_CODE: Readonly<Record<HotelCode, HotelDef>> = Object.freeze(
  Object.fromEntries(HOTELS.map((h) => [h.code, h])) as Record<HotelCode, HotelDef>,
);

export const ALL_HOTEL_CODES = HOTELS.map((h) => h.code) as [HotelCode, ...HotelCode[]];

/** ホテル詳細ページのURL */
export function hotelDetailUrl(code: HotelCode): string {
  return `https://reserve.tokyodisneyresort.jp/hotel/list/?searchHotelCD=${code}&displayType=hotel-search`;
}
