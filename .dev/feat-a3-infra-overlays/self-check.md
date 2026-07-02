# 자기점검 결과 — feat/a3-infra-overlays

## CERTAIN (자동 수정)
- [1] CommandPalette.tsx `key={item.title}` → 빈제목 페이지 중복 시 React key 충돌. **수정**: CommandItem에 optional `id` 추가, 컨테이너가 page.id 전달, `key={item.id ?? item.title}`(쇼케이스 하위호환).
- [2] EditorContainer.tsx saveWithToast/retry 비동기 경쟁 — stale 결과가 최신 토스트를 덮어씀/지움(연결 불안정 시 재현). **수정**: `attemptIdRef` generation 토큰으로 최신 시도만 showError/dismiss.

## QUESTION
- [1→자동수정 포함] CommandPaletteContainer 재열림 시 stale query/activeIndex 유지 → AC-6("빈 검색어로 열림") 위배. **수정**: open false 전이 시 query/activeIndex 리셋.
- [2→review 이월] pages 로딩 중/빈 워크스페이스일 때 팔레트가 그룹 헤더만 + 항목 0. FR-6 문자 충족이나 빈 결과. 빈/로딩 안내("페이지 없음"/"불러오는 중") 필요 여부는 product 결정 → 사용자 확인.

## 검증
- typecheck 5/5 · vitest 273 통과(회귀 0) 후 자기점검 수행.
