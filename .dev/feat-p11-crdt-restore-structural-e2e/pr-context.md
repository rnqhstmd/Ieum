# PR Context — P11

## Background
이음의 실시간 협업은 인라인 타이핑 라이브 수렴(P5)·op 영속화(P5b)·presence(P6)까지 구축됐으나, **신규/재접속 클라이언트가 join 시 과거 op를 받지 못해 빈 화면을 보는** 공백(US-CRDT-02)과, **Enter/Backspace 등 구조편집이 다중 클라에 수렴되지 않는** 공백(US-EDIT, 현재 preventDefault만)이 남아 있었다. 또 풀스택 수렴을 실제 브라우저로 검증할 e2e가 없었다. 이 PR은 P10 잔여(재접속 복원)와 P11의 협업 완성 항목을 한 슬라이스로 마감한다.

## Requirements (요약)
- **재접속 복원(US-CRDT-02, Must)**: join 시 relay가 pageId 전체 op를 serverSeq ASC로 조회해 op-batch로 전송, 클라가 순차 replay하여 기존 접속자와 동일 텍스트로 수렴. 빈 문서·멱등·replay 중 실시간 op 유실 없음.
- **구조편집 수렴(US-EDIT, Must)**: Enter(분할)·Backspace(병합)·마크다운 타입변경을 블록 op로 전송·수렴. 진실원천 DocState.
- **e2e(Must, 로컬 수동)**: 2-브라우저 동시편집·재접속 복원 검증.

## 범위 결정
- 재접속 복원 = **순수 op replay만**(Snapshot 연동·자동생성 제외, backend 무변경).
- e2e = **로컬 수동 구동**(자동 verify 게이트 비포함, storageState 사전주입).
- packages/crdt·backend **무변경**(BR-5). 기존 op 엔진(splitBlock/applyDocOp/serializeRga)·인과버퍼 재사용.

## Audit Summary
- 총 12건 (CRITICAL 1 · HIGH 5 · MEDIUM 6) — 대부분 PRD 명시 제외 / P5부터의 기존 구조.
- **수정(6)**: restoringRef try/finally(freeze 방지) · room.ts op-batch 죽은코드 제거 · Editor Backspace fallback 보정 · isWireEnvelope payload proto-pollution 가드 · op-batch pageId 검증 · loadByPage 에러 로깅.
- **수용·문서화**: membership 게이트 미주입(P5 기존, WS-AUTH 별도 슬라이스) · op-batch 크기 무제한(PRD가 Snapshot 슬라이스로 연기) · splitBlock 원자성(PRD 제외) · e2e CI 제외(PRD 결정).
- 자세한 내용은 `.dev/feat-p11-crdt-restore-structural-e2e/trust-ledger.md` 참조.

## 검증
- verify 게이트 PASS(신선): node test(crdt+ws-relay 85+web 179) + node build(web next build 포함) + backend test `--rerun-tasks` BUILD SUCCESSFUL(testcontainers, 0 fail).
- Spec PASS([Must] 11/11) · Quality PASS(Critical/Important 0) · 인수 ACCEPT.
