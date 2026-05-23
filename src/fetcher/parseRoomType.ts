/**
 * TDR の「客室の空き状況を確認する」リンクの class 属性から
 * エリア名と部屋タイプ名を抽出する純粋関数
 *
 * 例:
 *   "button next js-callVacancyStatusSearch トスカーナ・サイド カピターノ・ミッキー・スーペリアルーム"
 *   → { area: "トスカーナ・サイド", roomTypeName: "カピターノ・ミッキー・スーペリアルーム" }
 */
export type RoomTypeInfo = {
  area: string;
  roomTypeName: string;
};

const KNOWN_NOISE_CLASSES = new Set([
  'button',
  'next',
  'js-callVacancyStatusSearch',
]);

export class RoomTypeParseError extends Error {
  constructor(
    message: string,
    public readonly classAttr: string,
  ) {
    super(message);
    this.name = 'RoomTypeParseError';
  }
}

export function parseRoomTypeFromClasses(classAttr: string | null | undefined): RoomTypeInfo {
  if (!classAttr) {
    throw new RoomTypeParseError('class attribute is empty', classAttr ?? '');
  }

  // 既知のノイズクラスを除外
  const meaningful = classAttr
    .split(/\s+/)
    .filter((c) => c.length > 0 && !KNOWN_NOISE_CLASSES.has(c));

  if (meaningful.length === 0) {
    throw new RoomTypeParseError('No meaningful class tokens found', classAttr);
  }

  // 1トークンの場合: area は空、roomTypeName = そのトークン
  // (DCH等、エリア概念のないホテルでよくあるパターン)
  // 2トークン以上: 最初のトークンをエリア名、残りを部屋タイプ名として結合
  if (meaningful.length === 1) {
    return { area: '', roomTypeName: meaningful[0] ?? '' };
  }

  const [area, ...rest] = meaningful;
  return {
    area: area ?? '',
    roomTypeName: rest.join(' '),
  };
}
