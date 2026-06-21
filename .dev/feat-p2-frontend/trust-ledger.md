## Trust Ledger — P2 프론트엔드

### 통합 감사 (review · security)

- **Security clean**: Critical 0, High 0.
  - 세션 인증: 모든 API 호출이 기존 래퍼의 `credentials:'include'`(쿠키) 사용. 토큰을 프론트에 저장하지 않음.
  - XSS: 페이지 제목/아이콘/워크스페이스명은 React 텍스트 렌더(자동 이스케이프). `dangerouslySetInnerHTML` 미사용.
  - 인가: 권한 검사는 백엔드 AccessGuard가 강제. 프론트는 비멤버/타 WS 데이터를 임의 요청해도 서버가 403/404. 클라이언트 IDOR 표면 없음.
  - 401 처리: `ApiError(status=401)` → `/login` 리다이렉트(AC-13). 만료 세션이 데이터에 도달하지 못함.
  - 비밀정보: 프론트에 시크릿 없음. `NEXT_PUBLIC_API_URL`은 공개 값. OAuth 링크는 API_URL 기반 정적 구성.

- **[Minor] 검토됨-허용**:
  - M1: WorkspaceSwitcher가 드롭다운이 아닌 평면 목록(walking skeleton). 디자인의 접힘 드롭다운은 후속 UX. AC-5/10 충족엔 영향 없음. (PRD C 범위 단순화)
  - M2: AccountArea는 정적 표시("내 계정") — 현재 사용자 조회 API가 범위 밖(C1 Could). 디자인의 실제 사용자/메뉴는 후속.
  - M3: PageTreeNode 행에 `role="treeitem"` 미부여(컨테이너만 `role="tree"`). 키보드 트리 내비게이션은 후속 a11y 작업.

- **[LOW] 알려진 한계**:
  - L1: `handleCreate`에서 `createPage` 성공 후 `loadTree`가 401을 만나면 `/login` push와 `/page/{id}` push가 연속 발생할 수 있는 엣지(이중 네비게이션). 실사용 빈도 낮음, 다음 사이클에서 가드 가능.
  - L2: 트리/목록은 CSR 1회 로드(D1). 생성 후 전체 재조회(낙관적 갱신 아님) — MVP 규모에서 문제없음, 대량 데이터는 P8 페이지네이션 대상.
