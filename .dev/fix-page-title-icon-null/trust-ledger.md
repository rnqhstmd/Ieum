## Trust Ledger

### Hotfix 긴급 감사 (security-auditor, CRITICAL/HIGH만)
- **결과: CRITICAL 0 / HIGH 0 — 감사 통과, 배포 가능**
- 인증/인가 우회: 없음. `PageController.updatePage`·`PageService.updatePage`의 인가(`accessGuard.requireWorkspaceMember`)는 경로변수 `wsId` 기반이라 body 축소(icon 제거)와 무관. `apiPatch`는 `credentials:'include'`로 세션 쿠키 유지.
- 부분 갱신 계약: `if (request.icon() != null) page.setIcon(...)` — icon 키 누락 시 Jackson이 null 역직렬화 → 분기 스킵 → 아이콘 보존. PRD 주장과 코드 일치.
- 타 필드 영향: `UpdatePageRequest` record는 title/icon 2개 필드뿐(position 등 없음). body 축소가 영향 줄 필드 자체가 없음.
- 부수효과: 기존 landmine(향후 null=clear 계약 변경 시 사일런트 손실) 제거 방향. 새 위험 미추가.
