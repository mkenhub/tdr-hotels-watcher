import { describe, expect, it } from 'vitest';
import { parseRoomTypeFromClasses, RoomTypeParseError } from '../src/fetcher/parseRoomType.js';

describe('parseRoomTypeFromClasses', () => {
  it('basic case を正しくパースする', () => {
    const cls = 'button next js-callVacancyStatusSearch トスカーナ・サイド カピターノ・ミッキー・スーペリアルーム';
    expect(parseRoomTypeFromClasses(cls)).toEqual({
      area: 'トスカーナ・サイド',
      roomTypeName: 'カピターノ・ミッキー・スーペリアルーム',
    });
  });

  it('部屋タイプ名が複数トークンに分かれていても結合する', () => {
    const cls =
      'button next js-callVacancyStatusSearch next ヴェネツィア・サイド スーペリアルーム パラッツォ・カナルビュー';
    expect(parseRoomTypeFromClasses(cls)).toEqual({
      area: 'ヴェネツィア・サイド',
      roomTypeName: 'スーペリアルーム パラッツォ・カナルビュー',
    });
  });

  it('"next" が複数回現れてもノイズとして除去される', () => {
    const cls =
      'button next js-callVacancyStatusSearch next スペチアーレルーム＆スイート デラックスタイプ';
    expect(parseRoomTypeFromClasses(cls)).toEqual({
      area: 'スペチアーレルーム＆スイート',
      roomTypeName: 'デラックスタイプ',
    });
  });

  it('空文字や null だと RoomTypeParseError', () => {
    expect(() => parseRoomTypeFromClasses('')).toThrow(RoomTypeParseError);
    expect(() => parseRoomTypeFromClasses(null)).toThrow(RoomTypeParseError);
    expect(() => parseRoomTypeFromClasses(undefined)).toThrow(RoomTypeParseError);
  });

  it('意味のあるトークンが1つ未満だと RoomTypeParseError', () => {
    expect(() => parseRoomTypeFromClasses('button next js-callVacancyStatusSearch')).toThrow(
      RoomTypeParseError,
    );
  });
});
