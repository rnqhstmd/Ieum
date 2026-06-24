# Trust Ledger — op-batch 견고화 (loadByPage 실패 UX + join-epoch)

> security-auditor 통합 감사 + quality-reviewer + 오케스트레이터 트리아지. 브랜치 feat/collab-opbatch-hardening (base: feat/ws-auth-identity #28).

## 리뷰 요약
- spec-reviewer: SPEC PASS — [Must] 13/13. 범위 이탈 없음.
- quality-reviewer: QUALITY PASS — Critical 0, Important 1([동작불변]), Minor 4.
- security-auditor: CRITICAL 0 · HIGH 2 · MEDIUM 5. 결함(AC 위반·인증우회·데이터손실) 없음 — 전부 하드닝 갭/테스트 견고성.

## 통합 감사 (review)

### 수정 대상 (저비용·가치)
- **[GAP/HIGH→수정] retryRestore 반복 클릭 스팸 가드 없음** — `useCrdtDocument.ts:220`. 재시도 버튼 연타 시 `/me` fetch + join이 매번 발화(epoch가 서버측 stale은 처리하나 in-flight 요청·join 수 상한 없음). → **isRetrying ref 가드**로 in-flight 중 재호출 차단(behavior 변경 → RGR). 심각도 실질은 self-session 한정이라 MEDIUM에 가까우나 가드는 저비용.
- **[POLICY/MEDIUM→수정] authError + restoreError 동시 시 두 배너 공존** — `EditorContainer.tsx:47`. 세션만료+복원실패 겹치면 배너 2개. authError 시 복원 재시도는 무의미. → restoreError 배너를 `{restoreError && !authError && ...}`로 억제(behavior 변경 → RGR, 1-조건).
- **[OBSERV/Minor→수정] loadByPage 실패 console.warn 제거로 서버 관측성 후퇴** — `server.ts:162`. op-batch-error 전송은 클라 UX이나 서버 실패 로그 사라짐. → `.catch((err)=>{console.warn('[relay] loadByPage failed', err); sendIfCurrent(...)})` 로깅 복원([동작불변]).
- **[TEST/MEDIUM→수정] AC-6 테스트 stale 리스너 후등록 경쟁** — `server.test.ts`. secondBatch await **후** 리스너 등록 → 빠른 stale 메시지를 놓쳐 false-pass 위험. → 리스너 **선등록**(타이밍 의존 제거). 테스트 전용 수정.
- **[Important/동작불변→수정] retryRestore 빈 catch 의도 주석** — `useCrdtDocument.ts:221`. fetchAuth가 authError 처리·join은 동기라 실패 무영향. 의도 주석 추가.
- **[Minor→수정] 테스트 정리**: 80ms 매직넘버 `STALE_GRACE_MS` 상수화 + dead var `gotBatchError` 제거/단언 추가.

### 수용·문서화 (저위험 / 구조상 무해 / 후속)
- **[ASSUMPTION/HIGH→수용·테스트보강] retryRestore catch가 authError 가림** — 실제로 `fetchAuth`가 throw **전** `setAuthError(true)` 호출하므로 authError는 세팅됨(`currentUser.ts`). join이 서버에서 4001 거부되는 경로는 retrying transport 자가복구. → null→authError 케이스 **테스트 1건 보강**으로 의도 실증(수정 묶음에 포함 가능).
- **[GAP/MEDIUM→수용] transport 재연결 중 retryRestore 이중 join** — pending 버퍼 join + onOpen join. epoch가 stale 폐기로 정합 유지(데이터 무손상). isRetrying 가드가 부분 완화. 완전 dedup은 후속.
- **[RISK/MEDIUM→수용] op-batch-error pageId 빈 문자열 허용** — `protocol.ts` `typeof string`만. `errPageId===pageId` filter가 빈문자 오주입 방어(실질 위험 없음). op-batch 파서와 동일 수준(일관). 후속에서 length>0 검토.
- **[ASSUMPTION/MEDIUM→수용] restoreError/op-batch 순서역전** — 단일 join은 .then/.catch 택일이라 구조상 불가. 소켓별 클로저로 격리 확인. 주석만 권고.

## 교차 검증 정합
- FR-1~9·BR-1~4 전부 코드 정합(spec-reviewer 13/13). epoch socketChain 동기구간 캡처 ✓. backend/crdt 무변경 ✓. #28 토큰/멤버십 게이트·op 경로 무영향 ✓. 빈배치 vs 실패 구분 InMemory/Pg 일치 ✓.
