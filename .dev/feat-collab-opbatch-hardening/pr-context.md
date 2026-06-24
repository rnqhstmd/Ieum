# PR Context — 협업 op-batch 견고화 (슬라이스 1)

## Background
이음의 실시간 협업은 재접속 시 relay가 `opStore.loadByPage`로 op 이력을 읽어 `op-batch`로 복원한다(P11, PR #27). 그러나 (A) `loadByPage` 실패 시 relay가 빈 배치를 **무음 전송**해 클라가 빈 문서로 오인(데이터 손실 오인)하고, (B) op-batch 전송이 socketChain 밖 **fire-and-forget**이라 동일 소켓 재join 시 직전 join의 늦은 결과가 **stale 배치**로 새 세션에 흘러드는 갭이 있었다. collaboration trust-ledger의 연기분(W2 join-epoch·loadByPage 실패 UX)을 닫는 첫 하드닝 슬라이스다.

## Requirements (요약)
- **[Must]** loadByPage 실패 → `op-batch-error` 전송, web `restoreError` 비차단 배너 + 재시도(ready 경유 join). 빈 이력(정상 빈 배치)과 조회 실패 구분.
- **[Must]** 소켓별 join-epoch로 재join 시 stale op-batch/op-batch-error 격리.
- **[Must]** 복원 실패해도 로컬 편집 무중단(BR-1).

## 범위 결정
- ws-relay + web만(backend/`@ieum/crdt` 무변경). base=`feat/ws-auth-identity`(#28) 위 스택 — useCrdtDocument·server.ts·realtime이 #28과 겹쳐 스택 선택. **#28 머지 후 이 PR 머지.**
- retryRestore는 `ready`(fetchAuth) 게이트 경유로 토큰 재발급 후 join — 만료 토큰 4001 churn 회피. 재시도 스팸은 retryingRef 가드.
- 나머지 하드닝(Snapshot+delta·op-batch 청크분할, splitBlock 원자성, e2e CI 통합, FR-B6 커서)은 후속 슬라이스.

## Audit Summary
- 총 7건 (CRITICAL: 0 · HIGH: 2 · MEDIUM: 5) — 결함(AC 위반·인증우회·데이터손실) 없음, 전부 하드닝 갭/테스트 견고성.
- 핵심 수정: retry 스팸 가드(isRetrying) · authError 시 restoreError 배너 억제 · loadByPage 실패 console.warn 복원 · AC-6 테스트 stale 리스너 선등록 · STALE_GRACE_MS 상수화 · retryRestore catch 주석.
- 수용·문서화: transport 재연결 중 이중 join(epoch가 stale 폐기로 정합), op-batch-error pageId 빈문자(errPageId===pageId filter 방어), restoreError/op-batch 순서역전(구조상 불가). 상세: `trust-ledger.md`.

## 검증
- verify 게이트 PASS(신선): `pnpm test`(turbo 5: @ieum/crdt + ws-relay 112 + web 207) + `pnpm build`(turbo 3, next build) + typecheck 0.
- Spec PASS([Must] 13/13·[Should] FR-9·BR-4) · Quality PASS(Critical/Important 동작결함 0) · 인수 ACCEPT.
