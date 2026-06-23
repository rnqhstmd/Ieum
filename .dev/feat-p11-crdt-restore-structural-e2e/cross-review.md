# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p11-crdt-restore-structural-e2e (base: main)
- DEV_DIR: .dev/feat-p11-crdt-restore-structural-e2e
- 실행: 2026-06-23 · PR #27 리뷰(gemini) 동반 확인

## AC 충족 매트릭스
- **[Must] 13/13 O · [Should] AC-B5/B6 O(packages/crdt 기존 커버)** (qa-manager).
- 근거 일관: AC-A1~A5(server.ts op-batch 송신·loadByPage ASC·멱등·빈 batch), AC-B1~B4(useCrdtDocument onEnter/onBackspace/onSetType→crdt 직접호출), AC-C1/C2(e2e 작성, 로컬 수동).

## 설계 범위 이탈
이탈 없음. 코드 변경 전부 ws-relay·web·e2e 범위 내. **packages/crdt·backend 무변경(BR-5) 확인**. (context/·.dev/ 문서 갱신은 산출물.)

## 신규 위험 (trust-ledger 12건 제외)

### Warning (수정 권장)
1. **[GAP] IME 조합 가드 누락 — Editor.tsx handleKeyDown** (gemini + security-auditor 공통). `handleInput`엔 `if (composing.current) return`이 있으나 **`handleKeyDown`(Enter/Backspace)엔 없음** → 한글/CJK IME 조합 확정을 Enter로 누르는 순간 `onEnter`(splitBlock)/`onBackspace`가 의도치 않게 호출. **P11 신규 구조편집 경로 결함. trust-ledger 6건 수정에 미포함(별개 항목).** → handleKeyDown 첫 줄 `if (composing.current) return` 추가.
2. **[RISK] server.ts op-batch fire-and-forget(socketChain 밖)** (qa-manager + security-auditor). `void opStore.loadByPage(...).then(send)`가 socketChain await 밖 → ① 느린 loadByPage 중 소켓 닫히면 조용히 skip(클라 timeout/retry 없음, 재join 복구) ② 동일 소켓 빠른 재-join 시 stale batch가 순서 없이 도착 가능(클라 pageId 가드는 동일 pageId 재join 미차단). **단, 설계 결정 3은 AC-A3(replay 중 실시간 op 비블록)을 위해 의도적으로 socketChain 밖 배치** — socketChain await로 직렬화하면 AC-A3 의도 회귀. 재연결은 보통 신규 소켓(stale batch는 죽은 소켓行=무해). → 수용/문서화 권장(견고화는 join-epoch, 후속).

### Info (저비용/선택)
3. **[보안/품질] isWireEnvelope seq 검증 `typeof`만 → `Number.isInteger`** (gemini + security-auditor 공통). `typeof o.seq !== 'number'`만 검사해 NaN/Infinity/float 통과. `isRgaId`는 `Number.isInteger(counter)` 적용인데 seq는 비대칭. 양쪽(web protocol.ts:118 + ws-relay protocol.ts:124) `Number.isInteger(o.seq)`로 강화. **gemini 기보고, 미반영 신규.**
4. **[품질] convergence.e2e 수렴 단언 비대칭** (security-auditor). A 입력만 양쪽 `toContain` 확인 후 `textA===textB` → B 입력(" and B")이 아직 전파 안 된 상태에서 양쪽 모두 미포함으로 "동일" false-positive 가능. → `expect.poll`로 양방향(A·B 입력 모두 양쪽 포함) 대기 후 동일성 단언.
5. **[품질] convergence.e2e.ts:5 미사용 `chromium` import** (qa-manager). 데드 import. → 제거.
6. **[GAP] restore.e2e `waitForTimeout(500)` 고정 대기** (qa-manager + security-auditor). 영속화 완료의 유일 대기 수단 → 느린 환경 false 실패. (e2e 수동·trust-ledger flaky 수용과 동근원이나 restore.e2e는 별도 파일.) → 대기 상향 또는 op-ack/networkidle 대기, README 명시.
7. **[Info] useCrdtDocument sendOps: client null이어도 bump() 호출** (qa-manager). 기능상 정상(splitBlock 등이 doc 로컬 변경 → 리렌더 필요). client null 시 전송 없이 UI만 갱신될 수 있음 — 의도 주석 권장.

## PR #27 리뷰 동반 확인
- 상태: OPEN · **MERGEABLE** · reviewDecision 없음(정식 승인/변경요청 전)
- CI: **전부 통과** — Backend Test Results 236✅ / Gradle Testcontainers ✅(1m10s) / pnpm typecheck+test+build ✅(1m10s)
- gemini-code-assist(COMMENTED) 인라인 3건:
  - Editor.tsx:176 — handleKeyDown IME 조합 가드(위 Warning 1) **[HIGH]**
  - web protocol.ts:118 — seq Number.isInteger(위 Info 3) **[security-medium]**
  - ws-relay protocol.ts:124 — seq Number.isInteger(위 Info 3, 서버측) **[security-medium]**

## 총평
- 강점: AC 13/13·범위 이탈 없음·BR-5 준수·검증 정합. cross-review가 **gemini 2건(IME 가드·seq)이 실제 미반영 신규임을 교차 확인**.
- 합산: Critical 0, Warning 2, Info 5.
- 권고: 머지 전 차단 항목 없음(CI 그린·MERGEABLE). IME 가드(Warning 1)는 실제 UX 결함이라 수정 권장. seq Number.isInteger(Info 3)·e2e 단언/import 정리(Info 4/5)는 저비용 동반 수정 권장. server.ts fire-and-forget(Warning 2)은 AC-A3 의도라 수용·문서화.

## 처리 결과 (2026-06-23, 사용자: 핵심 수정 + 문서화)
- ✅ **W1 IME 조합 가드**: `Editor.tsx handleKeyDown` 첫 줄 `if (composing.current) return;` 추가 → 조합 중 Enter/Backspace가 split/merge 미유발. (gemini HIGH 해소)
- ✅ **I3 seq Number.isInteger**: web+ws-relay `isWireEnvelope` `typeof number`→`!Number.isInteger(o.seq)` → NaN/Infinity/소수 거부. (gemini security-medium ×2 해소)
- ✅ **I4 convergence.e2e 양방향 단언**: 최종 동일성 전에 A·B 입력이 양쪽 page 모두 포함될 때까지 `expect.poll` 대기.
- ✅ **I5 미사용 import**: convergence.e2e `chromium` 제거.
- ✅ **I6 restore.e2e**: `waitForTimeout(500)`→`waitForLoadState('networkidle')` + 주석.
- ✅ **I7 sendOps 주석**: client null에도 bump 사유 명시.
- ⛔ **W2 server.ts fire-and-forget(socketChain 밖)**: **수용·문서화**. 설계 결정 3이 AC-A3(replay 중 실시간 op 비블록)을 위해 의도적으로 socketChain 밖에 배치 — await 직렬화 시 AC-A3 회귀. 재연결은 보통 신규 소켓(stale batch는 죽은 소켓行=무해). 견고화(join-epoch)는 후속 슬라이스.
- 검증: web 186 pass + ws-relay 87 pass + typecheck 0. gemini 인라인 3건 전부 해소.
