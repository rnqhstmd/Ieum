## Trust Ledger — feat/a3-infra-overlays (phase-review)

### QA (qa-manager)
- [Critical] EditorContainer.tsx saveWithToast 성공 경로 dismiss() 누락 → 실패 토스트 잔류 중 "다시 시도"가 옛 내용 재저장(데이터 손실). **수정 대상.**
- [Warning] Sidebar ⌘K가 shiftKey/altKey 미가드 → Ctrl+Shift+K(devtools)까지 가로챔. **수정 대상.**
- [Warning] CommandPaletteContainer items useMemo deps에 인라인 onNavigate/onClose → Sidebar 리렌더 시 재계산(perf). (저순위)
- [Info] 방향키 하이라이트 scrollIntoView 없음 / activeIndex 리셋 useLayoutEffect / ErrorToast onRetry 조건부 렌더. (저순위)
- [QUESTION] 팔레트 빈/로딩 상태 안내 문구 필요 여부 → 사용자 확인.

### 통합 감사 (security-auditor) — CRITICAL 0 / HIGH 1 / MEDIUM 2 / LOW 3
- [HIGH/POLICY] ConnectionBanner "다시 연결됨 · 모든 변경사항 저장됨" 문구가 아키텍처 보장과 불일치(재연결 시 missing-op 복원 P8 미구현 → 유실 가능). 이번 배선이 처음 프로덕션 노출. **문구 완화 수정 대상.**
- [MEDIUM] saveWithToast 성공 시 실패 토스트 미소멸(= QA Critical과 동일, 병합).
- [MEDIUM] 전역 Ctrl+K가 ConfirmDialog(파괴적 확인) 위에서도 동작 → 모달 배타성 미보장, 키보드로 우회 이동 후 stale 확인창 재등장. **⌘K 가드 수정 대상.**
- [LOW] 워크스페이스 전환 로딩 구간 stale pages(BR-1 일시 위배). (저순위)
- [LOW] page.id 포맷 미검증 라우팅 재사용(기존 navigate). (저순위)
- [LOW/미확인] GET pages 서버 인가 강제 여부(백엔드 무변경 범위 밖).

### 조치
자동수정: (1) saveWithToast 성공 dismiss (2) ⌘K shift/alt+모달 가드 (3) ConnectionBanner 문구 완화. 저순위 Warning/Info·LOW는 사용자 판단으로 이월.
