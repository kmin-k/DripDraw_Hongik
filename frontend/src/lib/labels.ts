/**
 * ENUM → 한글 라벨.
 *
 * 값은 영어 대문자로 저장하고 한글은 프론트에서 붙입니다 (docs/erd.md).
 * 여러 화면이 같은 표기를 써야 해서 한곳에 모읍니다.
 */

export const ROAST = { LIGHT: "라이트", MEDIUM: "미디움", DARK: "다크" } as const;

export const REGION = {
  AFRICA: "아프리카",
  CENTRAL_AMERICA: "중미",
  SOUTH_AMERICA: "남미",
  ASIA_PACIFIC: "아시아·태평양",
} as const;

export const PROCESS = { WASHED: "워시드", NATURAL: "내추럴" } as const;

export const DRINK = { HOT: "핫", ICE: "아이스" } as const;

export const PHASE = {
  BLOOM: "뜸들이기",
  SECOND: "2차",
  THIRD: "3차",
  FOURTH: "4차",
} as const;
