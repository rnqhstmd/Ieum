// ─── 멤버 아바타 헬퍼 (presentational) ───────────────────────────
// 디자인의 presence 5색 순환을 실데이터에 안정적으로 매핑한다. 같은 seed(userId/email)는
// 항상 같은 색을 받으므로 가짜 고정색 없이 재현 가능한 색이 된다. 글자는 검정.

const AVATAR_COLORS = ['#6fd6e8', '#e8a0c0', '#a0e8b4', '#e8c06f', '#b0a0e8'] as const;

/** seed 문자열의 결정적 해시로 5색 중 하나를 선택한다. */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** 이름의 첫 글자(유니코드 안전, 대문자). 비면 '?'. */
export function initialOf(name: string): string {
  const ch = [...name.trim()][0];
  return ch ? ch.toUpperCase() : '?';
}
