# 자기점검 결과 — 초대 수락(Invite) (신규, UI 4상태+수락 스텁)

## Critical: 0건 (자기점검 통과)

## Warning (반영)
- [반영] page.tsx 전체 `'use client'` → 서버 컴포넌트로 분리: 클라이언트 로직(useSearchParams+상태결정+핸들러)을 `invite-content.tsx`('use client')로 분리, page.tsx는 서버 컴포넌트로 `<Suspense>`만. 올바른 Next 15 패턴.

## Info (반영)
- [반영] 스텁 핸들러의 `void token` dead code 제거.
- [반영] EXPIRED `관리자에게 요청` 버튼 `aria-disabled` 추가(스텁 명확화).

## QUESTION
- 추가 확인 사항 없음.

## AC 충족 (qa-manager 대조)
- 4상태(VALID 제네릭/EXPIRED 시계/ALREADY 체크/INVALID X) 문구·아이콘·CTA·색 명세 1:1 ✓
- 범위 경계: 수락/거절/관리자요청 스텁(실제 POST 없음), ALREADY→/dashboard·INVALID→/ 만 실제 링크 ✓
- 데이터 원칙: 가짜 팀명/초대자 없음(VALID 제네릭, 중립 `I` 마크, 초대자 줄 생략) ✓
- 상태 결정: ?state override → token 유무로 valid/invalid, Suspense 경계 ✓
- 토큰: main 토큰만(ok/danger/faint/dim/body/ink/accent/hair), fainter 미사용 ✓
- 접근성: 아이콘 aria-hidden, h1 구조, 버튼/링크 구분, 스텁 aria-disabled ✓

## 검증
- type-check: clean
- next build: 별도 기록(/invite 라우트)
- 미리보기: /invite?state=valid|expired|already|invalid
