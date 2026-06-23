# PRD: WS-AUTH-01 — WebSocket 신원위조 방지

> 결정(확정): ① 메커니즘=HMAC-SHA256 서명 토큰(AUTH_SECRET 공유) ② 전송=join `token` 필드 ③ 발급=`GET /api/users/me` 확장 ④ AUTH_SECRET 미설정 시 경고+검증 건너뜀(trust-relay 유지) ⑤ TTL=5분. base=main(cd1661e).

## 배경·취약점
web이 `/api/users/me`(JSESSIONID)로 실 userId를 얻어 join `{type,pageId,userId}`로 전송하면, relay는 그 `userId`를 **무검증 채택**(trust-relay, PR #15). WS-AUTH-02(멤버십 게이트)는 멤버십만 보고 **userId 진위는 확인하지 않는다** → 같은 워크스페이스 타 멤버 userId를 사칭하면 그 사람 이름으로 op가 영속화된다(`crdt_ops.created_by_id` 오염, 감사추적 위조, WS-AUTH-04 오조준). WS-AUTH-02/03/04/05는 기구현 — 이 슬라이스는 그 **앞단(userId 진위 확인)**을 막는다.

**제약**: backend AUTH_SECRET·JWT/HMAC 라이브러리 없음(HMAC-SHA256은 JDK `Mac`/Node `crypto` 내장 → 무라이브러리) · JSESSIONID는 HttpOnly(JS가 못 읽음) · relay↔backend는 backend→relay 단방향뿐 · relay는 `RELAY_DATABASE_URL` 미설정 시 InMemory+게이트 off.

## 목표
relay가 클라가 주장하는 `userId`를 신뢰하지 않고, **backend가 HMAC 서명한 단기 토큰**으로 실제 userId를 확정한다. 사칭 join을 차단하고 `crdt_ops.created_by_id` 신뢰성을 보장한다. 정상 로그인 사용자는 추가 단계 없이 동일하게 편집.

## 위협 모델
| 주체 | 공격 | 영향 |
|------|------|------|
| 워크스페이스 멤버 | join.userId를 타 멤버/OWNER UUID로 교체 | 피해자 이름 op·감사 위조·WS-AUTH-04 오조준 |
| 비멤버 | 멤버 userId 도용으로 멤버십 게이트 우회 시도 | 비인가 op 삽입 |

**잔존 위험(범위 밖)**: 토큰 발급 후 세션 revoke 즉시 반영, relay admin 토큰 미적용, replay 완전 차단(nonce), 프로세스 탈취.

## 요구사항 (FR)
- **[Must] FR-1** relay는 join의 `token`(HMAC 서명 토큰)을 검증하고 **토큰에서 도출한 userId를 connUserId로 채택**한다. join의 `userId` 필드 값은 신원 결정에 사용하지 않는다(AUTH_SECRET 설정 시).
- **[Must] FR-2** backend `GET /api/users/me`는 인증 세션의 실 userId + 그 userId·만료(5분)를 담아 `AUTH_SECRET`으로 HMAC-SHA256 서명한 `token`을 함께 반환한다.
- **[Must] FR-3** web은 join 전 `/api/users/me`에서 token을 획득해 join 메시지 `token` 필드로 relay에 전송한다.
- **[Must] FR-4** relay는 token이 없거나·서명 위조·만료된 경우 연결을 거부한다(AUTH_SECRET 설정 시).
- **[Must] FR-5** 거부 시 close code **4001**을 사용한다(기존 WS-AUTH 규약 일치).
- **[Should] FR-6** relay는 거부 사유(만료/서명불일치/필드누락)를 로그로 남긴다.
- **[Should] FR-7** web은 WS 재연결 시 token을 재획득해 join에 동반한다(만료 캐시 재사용 금지).
- **[Could] FR-8** (확정: `/api/users/me` 확장으로 발급. 별도 엔드포인트 미신설.)

## 비즈니스 규칙 (BR)
- **[Must] BR-1** 신원 확정은 join 시점, 이후 op는 확정 connUserId로 태깅. join 이후 userId 변경 불가.
- **[Must] BR-2** 토큰 TTL=5분(`exp`). 만료 토큰 join은 거부.
- **[Must] BR-3/BR-5** `AUTH_SECRET`은 backend·relay 공유 환경변수. 소스 하드코딩 금지.
- **[Must] BR-4** relay 검증은 stateless(1회용 무효화 없음). 짧은 TTL로 replay 완화.
- **[Must] BR-6** `AUTH_SECRET` 미설정(로컬/walking skeleton) 시 검증을 건너뛰고 기존 trust-relay 동작 유지 + 경고 로그. (relay 시작 거부 안 함.)

## 품질 기대
- **[Should] QE-1** 정상 로그인 사용자는 추가 클릭·로그인 없이 기존과 동일하게 실시간 편집.
- **[Should] QE-2** token 획득 실패(세션 만료 등) 시 사용자에게 재로그인 유도 상태 노출.

## 사용자 시나리오
- **정상**: web이 페이지 진입 시 /me로 userId+token 획득(JSESSIONID 자동첨부) → join에 token 동반 → relay가 검증·userId 확정 → 멤버십 게이트 통과 → 편집.
- **사칭**: 공격자가 join.userId를 피해자로 변조 + 자신의 유효 token 동반 → relay가 token에서 도출한 공격자 userId를 채택(join.userId 무시) → 사칭 불가.
- **만료**: 재연결 시 만료 token으로 join → relay close(4001) → web 재획득 후 재시도.
- **로컬(AUTH_SECRET 미설정)**: relay 시작 시 "AUTH_SECRET not set, identity verification disabled" 경고 → join 검증 건너뜀(trust-relay 유지).

## 영향 범위
- **backend**: `GET /api/users/me` 응답에 `token` 추가(HMAC 서명 유틸 신규), `AUTH_SECRET` env 신규.
- **apps/ws-relay**: `protocol.ts`(JoinMsg `token` 필드+검증), `server.ts`(join 게이트: token 검증→connUserId), `main.ts`(AUTH_SECRET off 분기), HMAC 검증 유틸. `AUTH_SECRET` env.
- **apps/web**: `currentUser.ts`(userId+token 획득), `relayClient.ts`/`useCrdtDocument.ts`(join에 token 동반, 재연결 재획득).
- **기존 WS-AUTH-02/03/04**: connUserId가 검증된 값이 되어 멤버십·태깅·강제종료 정확성 자동 향상.
- **설정**: `.env.example`·`apps/ws-relay/.env`·`application.yml`에 `AUTH_SECRET` 신규.
- **하위 호환**: AUTH_SECRET 미설정 시 기존 동작 유지(BR-6).

## 수용 기준 (G-W-T)

**AC-01 [FR-1, BR-1] — 정상 join, 토큰 userId로 connUserId 설정**
- Given: relay에 `AUTH_SECRET`이 설정되어 있고, 사용자 A의 userId·미래 만료로 올바르게 HMAC 서명된 token이 있다
- When: 그 token을 포함한 join 메시지를 전송한다
- Then: relay가 join-ack를 반환하고, 이후 그 연결의 op는 token에서 도출한 A의 userId로 `crdt_ops.created_by_id`에 태깅된다
- 검증: ws-relay vitest (테스트가 동일 secret으로 token 생성)

**AC-02 [FR-4, FR-5] — token 없이 join → 거부**
- Given: relay에 `AUTH_SECRET`이 설정되어 있다
- When: `token` 필드 없이 join 메시지를 전송한다
- Then: relay가 close code `4001`로 연결을 종료하고 join-ack를 보내지 않는다
- 검증: ws-relay vitest

**AC-03 [FR-4, FR-5] — 서명 위조 token → 거부**
- Given: relay에 `AUTH_SECRET`이 설정되어 있다
- When: 다른 키로 서명되었거나 서명 부분이 변조된 token으로 join한다
- Then: relay가 close code `4001`로 연결을 종료한다
- 검증: ws-relay vitest

**AC-04 [FR-4, FR-5, BR-2] — 만료 token → 거부**
- Given: relay에 `AUTH_SECRET`이 설정되어 있고, `exp`가 현재보다 과거인 올바르게 서명된 token이 있다
- When: 만료 token으로 join 메시지를 전송한다
- Then: relay가 close code `4001`로 연결을 종료한다
- 검증: ws-relay vitest (시각 mock)

**AC-05 [FR-1, 위협모델] — 사칭: join.userId와 token userId 불일치**
- Given: relay에 `AUTH_SECRET`이 설정되어 있고, 사용자 A의 유효 token이 있다
- When: join 메시지의 `userId` 필드를 사용자 B의 UUID로 변조하고 A의 token을 함께 전송한다
- Then: relay가 connUserId를 **token에서 도출한 A의 userId로 설정**하고(join.userId 무시), 이후 op가 A로 태깅된다. B의 userId는 connUserId로 채택되지 않는다
- 검증: ws-relay vitest

**AC-06 [FR-2] — `/api/users/me`가 userId + 서명 token 반환**
- Given: 유효한 JSESSIONID 세션을 보유한 사용자
- When: `GET /api/users/me`를 호출한다
- Then: HTTP 200과 함께 응답에 실 userId와, 그 userId·미래 만료(약 5분)를 담아 `AUTH_SECRET`으로 HMAC-SHA256 서명한 `token`이 포함된다
- 검증: backend Spring 통합 테스트

**AC-07 [FR-2] — 미인증 세션으로 호출 시 401**
- Given: JSESSIONID가 없거나 만료된 상태
- When: `GET /api/users/me`를 호출한다
- Then: HTTP 401이 반환된다
- 검증: backend Spring 통합 테스트

**AC-08 [BR-6] — AUTH_SECRET 미설정 시 trust-relay 유지**
- Given: relay의 `AUTH_SECRET` 환경변수가 설정되어 있지 않다
- When: token 없이(기존 방식) join 메시지를 전송한다
- Then: relay가 join을 수락하고(기존 trust-relay 동작) close(4001)이 발생하지 않으며, 시작 시 경고 로그가 출력된다
- 검증: ws-relay vitest

**AC-09 [FR-7, BR-2] — 재연결 시 token 재획득**
- Given: 사용자가 유효 세션으로 편집 중 WS 연결이 끊겼다
- When: web 재연결 로직이 동작한다
- Then: 이전 join에 쓴 token을 재사용하지 않고 backend에서 새 token을 획득해 join에 동반한다
- 검증: web vitest (`useCrdtDocument` 훅)

**AC-10 [QE-2] — token 획득 실패(401) 시 web 오류 처리**
- Given: 세션 만료로 `/api/users/me`가 401을 반환한다
- When: web이 join 전 token 획득을 시도한다
- Then: WS join이 시도되지 않고, 재로그인이 필요함을 알리는 상태(에러 UI/리다이렉트)가 노출된다
- 검증: web vitest

## 제외 범위
- WS-AUTH-02/03/04/05(기구현) · 후보 B(relay→backend 세션 검증 호출) · 별도 `/api/ws-token` 엔드포인트 · WS URL 쿼리 토큰 전송 · 세션 revoke 즉시 WS 강제종료 · relay admin 토큰 인증 · replay 완전 차단(nonce/사용추적) · 토큰 refresh API · PERM-06 Viewer.

## 확인이 필요한 사항
추가 확인 사항 없음. PRD가 확정되었습니다.

## 탐색 추가 항목
- `apps/ws-relay/src/server.ts`(join 게이트), `protocol.ts`(JoinMsg token+검증), 신규 HMAC 검증 유틸
- `apps/web/src/lib/realtime/relayClient.ts`·`useCrdtDocument.ts`(token 동반·재획득), `currentUser.ts`(token 획득)
- `backend/.../user/UserController.java`(/me 확장), `CurrentUserService.java`(userId 원천), 신규 HMAC 서명 유틸
- `apps/ws-relay/src/main.ts`(AUTH_SECRET off 분기), `application.yml`·`.env.example`·`apps/ws-relay/.env`(AUTH_SECRET)
