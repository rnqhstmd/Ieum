# Trust Ledger — P5 WebSocket Relay Walking Skeleton

## 통합 감사 (review, security-auditor)

총 11건 (CRITICAL 0, HIGH 4, MEDIUM 8). walking skeleton(localhost dev, BR-5 인증 목 처리) 맥락.

### HIGH
- **[GAP/HIGH] 소켓 error 핸들러 미등록** (`apps/ws-relay/src/server.ts`)
  - 근거: 개별 socket의 `error` 이벤트 미등록 → Node EventEmitter가 uncaughtException으로 프로세스 종료. 클라 비정상 종료 시 relay 다운.
  - 처리: **즉시 수정** (localhost 데모에서도 크래시 — 진짜 버그).
- **[RISK/HIGH] Origin 미검증 + [ASSUMPTION/HIGH] localhost 전제 코드 미보장** (`server.ts`)
  - 근거: WebSocketServer가 Origin 미검증, host 바인딩 없음. 외부 노출 시 LAN 접근 가능.
  - 처리: **즉시 수정** — `host: '127.0.0.1'` 바인딩으로 BR-5(localhost 한정)를 코드로 강제.
- **[RISK/HIGH] 무제한 연결 (DoS, Map 증가)** (`server.ts`/`room.ts`)
  - 근거: 연결/room 크기/rate 상한 없음.
  - 처리: **수용(문서화)** — walking skeleton 범위. 후속 슬라이스 전 MAX_CONNECTIONS 추가 TODO. (단순 카운터 가드는 즉시 추가 가능 → 함께 처리)

### MEDIUM
- **[RISK/MEDIUM] 무제한 메시지 크기 (maxPayload 기본 100MiB)** (`server.ts`) → **즉시 수정** (1줄, `maxPayload: 64KiB`).
- **[GAP/MEDIUM] room 교차 op 주입** (`room.ts:handleOp`) — join한 pageId와 다른 pageId op를 broadcast. 설계 의도("join 안 한 client: op-ack만")와 불일치. → **즉시 수정** (clientRoom 일치 검증).
- **[RISK/MEDIUM] parseServerMessage op 미검증** (`apps/web/.../protocol.ts`) — 서버는 isWireEnvelope 검증하나 클라는 비대칭. → **즉시 수정** (대칭 검증). (quality Minor 3과 동일)
- **[RISK/MEDIUM] prototype pollution 방어 부재** (parse 양쪽) → **수용(문서화)** — localhost 한정. 후속 강화 TODO. (직접 키 비교는 안전, op 불투명 전달 경로만 잔존)
- **[ASSUMPTION/MEDIUM] Math.random siteId 폴백 충돌** → **수용** — 현대 브라우저 crypto.randomUUID 표준, 폴백 거의 미사용.
- **[POLICY/MEDIUM] NEXT_PUBLIC_WS_URL 번들 노출** → **수용(문서화)** — 빌드 환경 설정 경고를 .env.example에 추가.
- **[GAP/MEDIUM] retrying 중 op 유실** (`transport.ts`) → **수용(문서화)** — FR-7/P8 범위(missing-op 복원 P8). 코드 주석 명시.
- **[GAP/MEDIUM] pageId 변경 시 doc/seq 미초기화** (`useCrdtDocument.ts`) → **수용** — page.tsx가 `key={pageId}`로 EditorContainer remount → 훅 재마운트로 doc/seq 신규. (실질 무해, 주석 명시)

### 정합 확인 (PASS)
BR-1(필드명)·BR-2(발신자 제외)·BR-4(applyDocOp 경유)·BR-5(인증 목)·FR-7(retry)·구조편집 비활성·IME 조합 — 모두 코드/테스트 정합.

## quality-reviewer (QUALITY PASS — Critical 0, Important 0, Minor 3)
- Minor1: retrying transport dispose 후 setTimeout 1회 fire 가능 → attach 진입부 `if(disposed) return` 가드. **즉시 수정**.
- Minor2: docToBlocks 매 입력 재계산 O(N) → 후속 메모이즈. **수용**.
- Minor3: 클라 op 검증 비대칭 → security MEDIUM과 동일, **즉시 수정**.

## 처리 결과 (사용자 승인: 핵심 방어 수정 + 나머지 문서화)

### ✅ 수정 완료 (RGR/하드닝, 테스트 검증)
- **소켓 error 핸들러** — `server.ts` `socket.on('error', ...)` 추가. 테스트: "내성: 클라 비정상 종료해도 서버 동작".
- **host 127.0.0.1 바인딩** — `server.ts` `DEFAULT_HOST='127.0.0.1'`. BR-5(localhost 한정)를 코드로 강제. 기존 smoke 테스트(localhost 연결) 유지.
- **maxPayload 64KiB** — `server.ts` `DEFAULT_MAX_PAYLOAD`.
- **연결 수 상한** — `server.ts` `DEFAULT_MAX_CONNECTIONS=100`, 초과 시 1013 close. 테스트: "연결 수 상한 초과 시 새 연결을 닫는다".
- **room 교차주입 가드** — `room.ts handleOp`가 클라가 실제 join한 room만 broadcast. 테스트 2건(교차 pageId 차단 / 미join op-ack만).
- **parseServerMessage op 검증 + proto 가드** — `web/.../protocol.ts` isWireEnvelope 대칭 검증 + DANGEROUS_KEYS. 테스트 5건(protocol.test.ts 신규).
- **parseClientMessage proto 가드** — `ws-relay/.../protocol.ts` DANGEROUS_KEYS. 테스트 1건.
- **retrying dispose 가드** — `transport.ts attach()` `if(disposed) return`.
검증: ws-relay 19/19, web 94/94, typecheck 0, next build green.

### 📝 수용(문서화, walking skeleton 범위)
- prototype pollution 심층(payload 내부) — top-level/op 봉투는 가드함. payload는 P4b 불투명 op, 후속 강화 TODO.
- siteId 스푸핑 — 인증 부재(BR-5). 후속 인증 슬라이스에서 연결별 siteId 등록.
- Math.random siteId 폴백 — `useCrdtDocument.ts` 주석 명시(현대 브라우저 crypto 표준).
- WS_URL 번들 노출 — `.env.local.example` 빌드 경고 주석 추가.
- retrying 중 op 유실 — `transport.ts` 주석(P8 missing-op 복원).
- pageId 변경 시 doc/seq — `useCrdtDocument.ts` 주석(key={pageId} remount 전제).
- docToBlocks O(N) 재계산 — 후속 메모이즈(quality Minor2).
- MAX_CONNECTIONS rate-limit 세분화 — 단순 카운터로 상한 적용함. 정교한 rate limit은 후속.
