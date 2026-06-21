# Review — P2 프론트엔드 (spec → quality + security)

## 1. Spec 리뷰 (AC 충족) — SPEC PASS

| AC | 충족 | 근거(테스트) |
|----|------|--------------|
| AC-1 listWorkspaces GET+credentials+파싱 | ✅ | workspaces.test.ts |
| AC-2 getPageTree 중첩 보존 | ✅ | pages.test.ts |
| AC-3 createPage POST+본문 | ✅ | pages.test.ts |
| AC-4 Zod 위반 throw | ✅ | workspaces.test.ts |
| AC-5 워크스페이스 2개 표시 | ✅ | Sidebar.test.tsx |
| AC-6 트리 중첩 렌더 | ✅ | PageTree.test.tsx |
| AC-7 펼침/접힘 토글 | ✅ | PageTree.test.tsx |
| AC-8 페이지 클릭 네비 | ✅ | PageTree.test.tsx |
| AC-9 새 페이지 생성→재조회→이동 | ✅ | Sidebar.test.tsx |
| AC-10 워크스페이스 전환 재조회 | ✅ | Sidebar.test.tsx |
| AC-11 빈 상태 | ✅ | PageTree/Sidebar.test |
| AC-12 에러 상태 | ✅ | Sidebar.test.tsx |
| AC-13 401→로그인 | ✅ | Sidebar.test.tsx |
| AC-14 랜딩(워드마크/h1/CTA) | ✅ | landing.test.tsx |
| AC-15 로그인 OAuth 링크 | ✅ | login.test.tsx |
| AC-16 앱 셸 다크/landmark | ✅ | app-shell.test.tsx |

[Must] 9/9, [Should] 3/3(S1 빈상태·S2 에러·S3 드로어는 디자인 모바일 반영), [Could] C1 계정/C2 검색 placeholder. 16/16 AC 테스트 통과. 설계 범위 이탈 없음(도메인 API 경로만 src/lib 직속으로 조정 — 동일 모듈).

## 2. Quality 리뷰 — QUALITY PASS

- **Critical 0 / Important 0.**
- 구조: 3계층(타입·데이터·표현) 분리로 모킹 경계 명확. 컴포넌트는 단일 책임(Switcher/Tree/Node/NewPage/Account).
- 타입: `tsc --noEmit` 0 error. Zod로 런타임 경계 검증.
- 빌드: `next build` 성공(6 라우트). 번들 landing 3.46kB / 공유 103kB.
- **Minor**(허용, trust-ledger 기재): WorkspaceSwitcher 평면목록(드롭다운 후속), AccountArea 정적, treeitem role 미부여.

## 3. Security 감사 — CLEAN

trust-ledger.md 참조. Critical 0/High 0. 쿠키 세션, React 이스케이프, 401→login, 시크릿 없음, 인가는 백엔드 강제.

## 결론
SPEC PASS → QUALITY PASS → SECURITY CLEAN. verify 게이트(tsc 0 / vitest 17 / build ✓) 통과. 커밋·PR 진행.

## Cross-Review 정정 (사후 반영)
초기 본 리뷰는 **[Should] 3/3·M4 충족으로 과대 보고**했음. cross-review가 다음을 적발·수정:
- S3(모바일 드로어)는 실제 미구현이었음 → `AppShell` 드로어 구현으로 충족(3/3).
- M4 "하위 페이지 생성" 미구현이었음(AC-9가 최상위만 검증) → 행별 "하위 추가" + `onCreateChild` 구현으로 완전 충족.
- I1 position(개수 기반)을 형제 max+1로 수정.
최종: **22 테스트 통과**, tsc 0, build 성공. 상세는 cross-review.md "처리 결과" 참조.
