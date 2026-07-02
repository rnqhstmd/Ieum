## Trust Ledger — feat/settings-help-pages (phase-review)

### spec-reviewer: SPEC PASS (AC-1~9 전건 충족, 범위 이탈 없음)
### quality-reviewer: QUALITY PASS (Critical 0 / Important 0)
- [Minor/동작불변] useTheme self-dispatch가 자기 syncFromDom도 트리거해 동일값 setState 1회 중복(React bail-out, 무해).
- [Minor/동작불변] 로그아웃 2줄 인라인 중복(settings·AccountArea) — Q3 수용 결정.
- [Minor/동작불변] 테마 라벨 타입 `'다크'|'라이트'` 중복 선언(useTheme·AccountMenu) — 공유 타입 추출 여지.
→ 전부 비차단, 메모만.

### security-auditor: CRITICAL 0 / HIGH 0 / MEDIUM 1 / LOW 2 / ASSUMPTION 2
- [MEDIUM/GAP] 클라이언트 전용 인가 가드(서버 미들웨어 없음, /settings·/help 200 셸 반환 후 getCurrentUser 401만 감지). **기존 dashboard와 동일 컨벤션 — 신규 위험 아님, 초기 loading에 계정데이터 미포함(flash 없음).** 권고: 서버측(미들웨어/서버컴포넌트) 세션 체크를 후속 백로그.
- [LOW] 도움말 비-401 실패 시 정적 콘텐츠 노출 — Q2 결정, 콘텐츠에 PII 없음(고정 소개 3줄) → 무해.
- [LOW] 로그아웃 실패 무통보(세션 유지 fail-safe) — Q3/기존 패턴.
- [ASSUMPTION] 백엔드가 미인증 시 항상 401 반환하는 전제(다른 코드면 /login 누락) — 백엔드 무변경 범위 밖, 미검증.
- [ASSUMPTION] logout이 서버 세션 실제 무효화하는지 — 백엔드 무변경 범위 밖.
- XSS/주입/SSRF/민감필드(token) 노출: 없음(name/email만 렌더, dangerouslySetInnerHTML 전무, 입력폼 없음).

### 조치
Critical/HIGH 0 → 자동수정 불필요. 클라이언트 전용 인가(MEDIUM)는 기존 컨벤션 확장이라 배포 차단 아님 → 서버측 인가 보강을 후속 백로그로 권고. Minor 3건은 비차단 메모.
