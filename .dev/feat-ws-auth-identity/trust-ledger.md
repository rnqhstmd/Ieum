# Trust Ledger — WS-AUTH-01 (WebSocket 신원위조 방지)

> security-auditor 통합 감사(phase-review) + 트리아지. 브랜치 feat/ws-auth-identity. quality: PASS(Critical/Important 0, Minor 5).

## 통합 감사 (review) — 12건 (CRITICAL 0 · HIGH 5 · MEDIUM 5 · 참고 2)

### 수정 대상 (실 결함/저비용 견고화)
- **[GAP/HIGH] userConnections 등록이 membershipGate 블록 안에만 → WS-AUTH-04 무력화** — `server.ts:132-133`. authSecret 설정 + membershipGate off(RELAY_DATABASE_URL 미설정) 조합에서 connUserId는 token userId로 설정되나(L136) userConnections 미등록 → `disconnectUser(userId)` 0건. (기존 PR #15 구조를 WS-AUTH-01이 새 조합으로 노출.) 실 영향은 제한적(DB off면 멤버제거 자체 없음)이나 구조 정합 필요. → **connUserId 확정 후 게이트 무관 userConnections 등록 공통화**(재-join Set 정리 포함). **수정.**
- **[RISK/HIGH] timingSafeEqual 경로가 base64url 문자열 바이트 비교(설계 의도=HMAC 원시바이트 비교와 다름)** — `wsToken.ts:23-25`. 현재 동작은 올바름(같은 base64url 문자열↔같은 바이트, 공격자 우회 불가)이나 설계 정합·향후 인코딩 변경 안전성 위해 `timingSafeEqual(expectedBuf, Buffer.from(sig,'base64url'))` + byteLength 선검사로 견고화. **수정(저비용).**
- **[RISK/HIGH] .env.example AUTH_SECRET 누락(BR-3/5 위반)** — 설계 변경범위 명시인데 green 누락. 미설정 시 신원검증 무음 비활성. → `.env.example` + `apps/ws-relay/.env.example`에 AUTH_SECRET 추가. **수정.**
- **[RISK/HIGH] web protocol.ts JoinMsg에 userId 필드 누락** — `protocol.ts:7-13`. relayClient가 인라인 타입으로 송신해 컴파일/런타임 무해(quality도 Minor)하나, 타입 계약 일관성·trust-relay 경로 userId 보장 위해 `userId?: string` 추가. **수정(저비용).**
- **[RISK/MEDIUM] exp Infinity 우회(Number.isFinite/isInteger 미검증)** — `wsToken.ts:47`. `exp:1e999`→Infinity→`<=now` false로 만료 우회. **단 HMAC 서명 위조 전제**라 독립 취약점 아님(공격자 secret 없이 유효 서명 불가). 저비용 견고화 `Number.isInteger(o.exp)`. **수정.**
- **[POLICY/HIGH] currentUser.ts catch 무음(로그 없음)** — `currentUser.ts:19`. 인증 흐름 실패는 보안 이벤트. `console.warn` 추가. **수정(저비용).**

### 수용·문서화 (범위 밖 / 설계 결정 / 과방어)
- **[RISK/MEDIUM] fetchCurrentUser 401·500·네트워크 동일 null 처리** — AC-10은 401만 정의. 500/네트워크 시 authError 오노출(가용성). 범위 확대라 **수용**(현행 유지, 후속 개선 후보).
- **[GAP/HIGH→문서화] relayClient catch가 authError 미설정(fetchAuth 의존 암묵)** — 현재 fetchAuth가 유일 ready 구현이라 정상 동작. 인터페이스 계약 JSDoc 주석은 저비용이라 동반, 콜백화는 **수용**(과설계).
- **[GAP/MEDIUM→수용] 비대칭 배포 방어장치 없음(문서만)** — 설계 결정(배포순서·동시주입 가이드). 코드 강제는 범위 밖.
- **[GAP/MEDIUM→수용] backend token=null + relay on → close(4001) 무음** — 비대칭 배포 하위. 설계 인지.
- **[ASSUMPTION/HIGH→수용] wss 미강제** — 인프라(역방향 프록시) 책임. 프로덕션 ws:// 경고는 후속.
- **[ASSUMPTION/MEDIUM→수용] 골든벡터 SECRET 프로덕션 사용 방지 없음** — known-weak-secret 거부는 과방어. 테스트 전용 명시로 충분.
- **[ASSUMPTION/MEDIUM→수용] fetchAuth useCallback closure** — setState/module fn/ref.current 모두 안전(정상 동작).

### 교차 검증 정합 (참고)
- FR-1(token userId 채택·join.userId 무시) ✓ AC-05 실증 · FR-2/4/5 ✓ · BR-1/2/4/6 ✓ · FR-7(재연결 재획득) ✓ · 골든벡터 양측 박제 ✓ · packages/crdt 무변경 ✓.

## 처리 결과 (사용자: 핵심 수정 + 문서화)
- ✅ **G1 userConnections 공통화**: server.ts에서 connUserId 확정 후 게이트 무관 등록(재-join 정리 포함) → authSecret-only 조합에서도 WS-AUTH-04 disconnectUser 정합. 전용 테스트 추가.
- ✅ **R1 timingSafeEqual 바이트 비교**: base64url 문자열 비교 → HMAC 원시 바이트(Buffer) 비교 + byteLength 선검사(설계 의도 정합). 골든벡터 유지.
- ✅ **R5 exp 정수 검증**: `Number.isInteger(o.exp)`로 Infinity/소수/NaN 거부. 전용 테스트(R5-a/b) 추가.
- ✅ **R3 web JoinMsg userId 필드**: protocol.ts 타입 계약 일관성.
- ✅ **P10 currentUser catch 로깅**: `console.warn` 추가(인증 실패 감사 추적).
- ✅ **R2 .env.example AUTH_SECRET**: 루트 + apps/ws-relay/.env.example 신규(설계 변경범위 누락 보강).
- 검증: ws-relay 95 + web 152 + typecheck 0(ws-relay·web). backend 무변경.
- 📄 **수용·문서화**: fetchCurrentUser 401/500 미구분(범위 확대)·비대칭배포 방어/무음(설계 결정)·wss 미강제(인프라)·골든벡터 secret 프로덕션 방지(과방어)·fetchAuth closure(정상)·relayClient catch authError 의존(정상 동작) — 위 분류대로 수용.
