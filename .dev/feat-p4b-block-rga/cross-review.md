# Cross-Review 결과

- advisor: claude (오케스트레이터 직접 — qa-manager/security-auditor idle-fail 폴백)
- 브랜치: feat/p4b-block-rga (base: main)
- DEV_DIR: .dev/feat-p4b-block-rga
- 미션: 산출물(PRD/설계/Trust Ledger) 약속 대비 코드 충실도 + 신규 위험 (trust-ledger 중복 제외)

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 createDocument 빈 paragraph 1개 | O | block.ts:55-66 createDocument → firstId block-insert 'paragraph' |
| AC-2 docToBlocks 순서·텍스트 도출 | O | block.ts:148-153 getVisibleNodes(blockRga)+toText(inline) |
| AC-3 block-insert + 빈 내부 RGA | O | block.ts:73-82 applyOp(blockRga)+inlineRgas.set(createRga) |
| AC-4 block-delete tombstone·멱등 | O | block.ts:84-87 (applyOp delete 멱등 재사용) |
| AC-5 block-set-type LWW(clock) | O | block.ts:88-95 + applyLww(clock>) |
| AC-6 동일 clock siteId tie-break | O | block.ts applyLww `op.siteId > meta.typeSiteId` |
| AC-7 인라인 blockId 스코프 | O | block.ts:96-114 inlineRgas.get(blockId) 라우팅 |
| AC-8 splitBlock 커서 이후 이동 | O | block.ts:166-191 tail.slice(cursorIndex)+delete+reinsert |
| AC-9 split 원격 수렴 | O | block.test AC-9 (shuffle 적용 후 ['Hel','lo'] 동일) |
| AC-10 mergeBlockWithPrev | O | block.ts:197-220 prev 끝 재삽입+block-delete |
| AC-11 첫 블록 병합 null | O | block.ts getPrevVisibleBlock idx<=0 → null |
| AC-12 동시 분할 수렴 tie-break | O | 외부 RGA compareIds(제네릭) + block.test AC-12 (2@B,2@A) |
| AC-13 인라인 선도착 인과버퍼 | O | block.ts pendingInline + drainPending |
| AC-14 임의순서·중복 수렴 | O | block.test AC-14 property 120회 |
| AC-15 wire 봉투 왕복 | O | wire.ts toWire/fromWire + wire.test 4건 |

[Must] 13/13 충족, [Should] 2/2 충족. **모든 AC가 코드에 충실히 반영됨.**

## 설계 범위 이탈

- **경미한 이탈(정당)**: `op.ts` — design.md "변경 범위"에 `op.ts: 유지`로 명시됐으나 `makeInlineInsertOp`/`makeInlineDeleteOp` 2개 헬퍼가 추가됨.
  - 변경 요약: 인라인 op 생성 헬퍼(타입 가드/메이커 일관 위치).
  - 정당성: 설계 §7(splitBlock/merge가 인라인 op 생성)·§9가 인라인 op 생성을 요구하므로 범위 내. review.md 스펙 리뷰에서 이미 정당 판정. **이탈로 인한 위험 없음**(순수 생성자, 기존 export 무변경).
- 그 외 코드 변경(rga/block/wire/index + 2 테스트)은 design.md 변경 범위와 정확히 일치.

## 신규 위험

(trust-ledger.md 기존 3건[toWire siteId/LWW Lamport/동시분할 복제]은 제외, 신규만)

### Warning
- **[GAP] P5 조인/리플레이용 "빈 DocState" 생성 경로 부재** — block.ts createDocument
  - 위치: packages/crdt/src/block.ts:55-66
  - 근거: `createDocument`는 항상 paragraph 블록 1개를 자동 주입한다(AC-1 요구사항이라 정당). 그러나 **두 번째 클라이언트가 기존 문서에 합류**하여 op 리플레이/스냅샷으로 초기화하려면 자동 블록이 없는 빈 `DocState`가 필요하다. 자동 블록이 있으면 수신한 원본 첫 블록과 합쳐져 블록이 중복된다. 테스트도 이 한계 때문에 export되지 않은 로컬 `emptyDoc` 헬퍼(block.test.ts:18-27)를 직접 정의했다.
  - 권고: P5 진입 전 `createEmptyDocument(siteId)`(또는 `createDocument({ withInitialBlock:false })`)를 export하거나, 조인 클라이언트의 "스냅샷 deserialize → op replay" 초기화 경로를 명시 문서화. (P4b 자체 AC는 영향 없음 — P5 차단 위험)

### Info
- **[ASSUMPTION] wire `opType`가 인라인 vs 블록 insert/delete를 구분하지 못함** — wire.ts:9
  - 근거: `opType`은 `AnyOp['type']`이라 인라인 op와 (가상의) 비스코프 op가 모두 `'insert'`/`'delete'`로 동일. 구분은 `payload.blockId` 유무로만 가능.
  - 영향: 현재 전송 op는 항상 `AnyOp`(인라인은 blockId 보유)이므로 `applyDocOp` 라우팅은 정확. 단 P5에서 opType만 보고 분기하는 소비자는 오분류 위험.
  - 권고: P5 wire 프로토콜에서 `payload.blockId` 검사를 명문화하거나 `opType`에 `inline-insert`/`inline-delete` 구분 태그 도입 검토.
- **[GAP] splitBlock 커서가 가시 길이 초과/끝일 때 동작 미검증** — block.ts:178
  - 근거: `getVisibleNodes(inline).slice(cursorIndex)`는 끝/초과 시 빈 tail → 빈 새 블록 생성(줄 끝 Enter, 올바른 동작)이나 단위 테스트 부재.
  - 권고: "split at end → 빈 후행 블록" 회귀 테스트 1건 추가(저비용 견고성).

## references 위반
- references/ 디렉토리 없음 → 해당 없음.

## 총평
- **강점**: ① 모든 AC가 코드에 충실 반영(13/13 Must), ② 제네릭 재사용으로 인라인 RGA 백워드 호환 유지하며 블록 RGA 구축(DRY), ③ 2단 인과버퍼·LWW·tie-break가 권위 규격(§4-M)과 정확히 정합.
- **합산**: Critical 0, Warning 1, Info 2 (모두 신규, trust-ledger 중복 없음).
- **권고**: Warning(빈 DocState 경로)은 P4b를 막지 않으나 **P5 시작 전 반드시 해소** 필요. Info 2건은 P5 인계 메모로 충분.

## 처리 결과 (사용자 "모두 수정" — Gemini PR #9 리뷰 4건 통합)

Gemini Code Assist(PR #9) 리뷰 4건과 cross-review 신규 항목을 중복 제거하여 전부 반영:

- **[HIGH] toWire siteId 필수화**(Gemini #1 + trust-ledger INFO#1): `toWire(op, seq, siteId)` 필수 매개변수, `originSiteId` 도출 제거. delete op의 target-site 오염 차단. wire.test 갱신. → **수정됨** + trust-ledger INFO#1 **해소**.
- **[MED] splitBlock 범위 가드**(Gemini #2 + cross-review I3): cursorIndex 음수/초과 시 no-op([]). 상태 변경 전 가드. 회귀 테스트 3건. → **수정됨**.
- **[MED] localInlineInsert/localInlineDelete**(Gemini #3): 로컬 인라인 편집 헬퍼 추가 + index.ts re-export(Gemini #4). 테스트 3건. → **수정됨**.
- **[WARN] createEmptyDocument**(cross-review W1): P5 조인/리플레이용 빈 문서 생성자 export. createDocument가 재사용. 테스트 2건. → **수정됨**.
- **[INFO] wire opType 모호**(cross-review I2): wire.ts 주석으로 명문화(인라인/블록 미구분 → payload.blockId 검사). → **문서화**.

검증: crdt **59/59**(기존 51 + 신규 8) · web **64/64** · next build green · tsc 0.
