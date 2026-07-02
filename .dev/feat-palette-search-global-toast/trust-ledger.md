## Trust Ledger — 팔레트 확장 + 토스트 전역화

### 통합 감사 (review) — security-auditor
CRITICAL 0 / HIGH 0 / MEDIUM 5. 감사 통과(배포 차단 사유 없음).

**교차검증 정합(위험 없음)**
- 인가: 멤버 관리 명령·사람 그룹 SHARED 노출은 UI 게이팅일 뿐, 실제 인가는 백엔드 AccessGuard(requireWorkspaceMember/requireOwner)가 담당 → 403은 프론트에서 비401로 조용히 그룹/버튼만 숨김(오인 없음).
- PERSONAL 이메일 미노출(그룹 자체 미생성, AC-A13), XSS 없음(React 텍스트 이스케이프, dangerouslySetInnerHTML 0건), 토스트 문구 고정·PII/에러원문 미포함, 로그아웃/테마는 클라이언트+세션클리어만.

**MEDIUM 5건**
- [GAP/MEDIUM #1] Sidebar mutation 재시도("다시 시도")에 in-flight 중복 실행 가드 없음(ErrorToast 버튼 disabled 없음). 5초 내 연타 시 동일 parentId로 빈 페이지 중복 생성 가능. (MembersModal의 `inviting` 플래그와 대비)
  - 권고: 재시도 진행 중 버튼 비활성화 또는 mutation in-flight 락.
- [GAP/MEDIUM #2] handleCreate 재시도 시 형제 position 계산이 실패 시점 pages 스냅샷에 고정 → 트리 변경 후 재시도 시 stale position. 백엔드 position 유일성 강제 여부 미확정.
  - 권고: 재시도 시 최신 pages 재읽기 또는 서버 측 position 계산 위임.
- [GAP/MEDIUM #3] "사람 찾기" 그룹 지연 삽입 시 activeIndex 미보정 → 즉시효과 명령(로그아웃/테마/생성)에 하이라이트 밀림으로 Enter 오조작 위험. design.md 리스크에 "허용하되 인지"로 문서화됨.
  - 권고: members 최초 도착 프레임에 activeIndex 0 리셋 또는 항목 id 기준 하이라이트 유지.
- [ASSUMPTION/MEDIUM #4] loadTree 401 후에도 handleCreate가 navigate(created.id) 계속 호출 → 세션 만료 시 로그인 대신 페이지 상세로 이동 경쟁. 실질 위험은 /page/{id} 화면의 마운트 시 401 재검증 여부에 의존(범위 밖).
  - 권고: /page/{id} 재검증 확인, 없으면 navigate 전 401 가드.
- [불일치/정보성 #5] usePaletteMembers 가드가 design.md "세대+wsId" 표현과 달리 active 클로저만 사용 — React cleanup 순서상 기능적 동등(위험 없음). 문서-코드 표현 차이 기록.

### 코드 품질 (review) — quality-reviewer
Critical 0 / Important 1([동작불변]) / Minor 3(비차단).
- [Important/동작불변] Sidebar.tsx onCreatePage useCallback([handleCreate])가 handleCreate 매 렌더 재생성으로 실효 없음 + 주석 사실 불일치. → refactor-coder 대상.
- [Minor] god-component 팽창, mutation DRY-lite(4중 반복), 재시도 클로저 ws 캡처 시점(엣지). 비차단.
- 검증 완료(결함 없음): usePaletteMembers stale 가드(active 충분), rawGroups useMemo 의존성 완전, 재시도 인자 캡처 정확.

### spec (review) — spec-reviewer
SPEC PASS — Must 34/34 + Should 1/1. 설계 이탈 없음.

### 리뷰 반복 처리 결과
- 1회차 QUALITY FAIL(Important: onCreatePage useCallback 실효) → useCallback 체인 고정으로 **해소**(2회차 확인).
- 보안 M1(재시도 중복) → ErrorToast 재시도 1회 제한(RGR)으로 **수정**.
- 보안 M3(사람 그룹 지연 삽입 activeIndex 밀림) → Container `[members]` effect 리셋(RGR)으로 **수정**.
- M1 수정이 유발한 신규 [동작결함](ToastProvider keyless → retried 누수) → ToastProvider 토스트별 key 부여(RGR)로 **수정**(RESET-ON-REPLACE 테스트로 검증).
- 잔여 기록(후속): 보안 M2(재시도 position stale), M4(401 후 navigate 경쟁 — /page 재검증 의존), M5(정보성). 품질 Minor: god-component 팽창, mutation DRY-lite, 재시도 ws 캡처, activeIndex 리셋 3경로 통합 여지 — 전부 비차단.
- 최종: Critical 0 / Important 0 / Security CRITICAL·HIGH 0. **리뷰 통과.**
