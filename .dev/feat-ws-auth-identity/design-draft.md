# 설계 초안 (architect) — WS-AUTH-01

> 확정본은 design.md. design-critic/test-architect 입력용. 설계 규모: 대형.

## 아키텍처 (토큰 발급·검증)
- **발급(backend)**: GET /api/users/me → CurrentUserService.requireCurrentUserId() → WsTokenService.issue(userId): payloadJson `{"userId":"<uuid>","exp":<now+300초>}` → `p=base64url(UTF-8(json))`, `sig=base64url(HMAC-SHA256(p의 ASCII, AUTH_SECRET))`, token=`p.sig`. MeResponse{id,email,name,token}. 미설정 시 token=null.
- **전송(web)**: fetchCurrentUser()→{userId,token} → relayClient join `{type,pageId,userId,token,presence}`. 재연결 시 재획득.
- **검증(relay)**: server.on(join): authSecret 설정 시 `verifyToken(token,secret,now)` → null이면 close(4001)+log, 성공 시 connUserId=token.userId(**join.userId 무시**) → membershipGate.isMember(connUserId,pageId) 실패 close(4003). 미설정 시 경고+trust-relay(join.userId). 검증 순서: token(4001)→멤버십(4003).

## 토큰 포맷 (양측 바이트 정합)
`base64url(payload) + "." + base64url(HMAC_SHA256(p_ascii, secret))`. payload `{"userId","exp"}` 키순서 고정, exp=epoch초, UTF-8, base64url 패딩제거. 서명입력=base64url 문자열 p의 ASCII 바이트. 구분자 '.' 정확히 2분할. 검증순서: split→timingSafeEqual(서명)→decode·JSON파싱(proto가드)→exp>now→userId string≤64. **골든 벡터**(동일 secret/userId/고정 exp→동일 token 리터럴)를 backend WsTokenServiceTest + relay wsToken.test.ts 양측 단언으로 인코딩 일치 보장. Java `Base64.getUrlEncoder().withoutPadding()` / Node `base64url`.

## 변경 범위
**신규(5)**: backend `WsTokenService.java`+`WsTokenServiceTest.java`, relay `wsToken.ts`+`tests/wsToken.test.ts`+`tests/tokenFixture.ts`.
**수정**: backend `UserController.java`(MeResponse+token), `application.yml`(`app.auth.secret:${AUTH_SECRET:}`), `UserMeIntegrationTest`. relay `protocol.ts`(JoinMsg.token+파싱), `server.ts`(join token 검증+authSecret/now 주입), `main.ts`(AUTH_SECRET 로드·off 경고), `tests/server.test.ts`. web `currentUser.ts`(fetchCurrentUser {userId,token}), `relayClient.ts`(join token+ready 팩토리화), `useCrdtDocument.ts`(token 주입·재연결 재획득·authError), `protocol.ts`(JoinMsg.token), 해당 테스트. 설정 `.env.example`/`apps/ws-relay/.env`(AUTH_SECRET).
**무라이브러리**: JDK Mac/Base64, Node crypto 내장.

## 컴포넌트 시그니처
- backend `WsTokenService(@Value("${app.auth.secret:}") secret, Clock clock)`: `String issue(UUID userId)`(미설정 null), TTL_SECONDS=300. Clock 주입(테스트 fixed).
- `MeResponse(UUID id, String email, String name, String token)`.
- relay `verifyToken(token?:string, secret:string, now:number): {userId}|null` — crypto.createHmac+timingSafeEqual, base64url decode, exp>now, userId≤64.
- relay `protocol.ts` JoinMsg.token? + 파싱(MAX_TOKEN 512 상한, 형식만).
- relay `createRelayServer({...,authSecret?, now?})`: join 게이트에 verifyToken 결합(membershipGate 앞, close 4001 우선).
- relay `main.ts`: `AUTH_SECRET||undefined`, 미설정 경고.
- web `fetchCurrentUser(): {userId, token:string|null}|null`(401→null=QE-2).
- web `relayClient` opts: `getToken?`, `ready?: ()=>Promise`(**팩토리화** — 재연결마다 재획득, FR-7/AC-09).
- web `useCrdtDocument`: tokenRef, authError state(AC-10), `ready: fetchAuth`(401시 throw→join 미시도).

## 구현 순서(RGR→AC)
1. 골든벡터+WsTokenService.java+단위테스트(AC-06일부) 2. relay wsToken.ts verifyToken+test(양측 골든벡터, AC-02/03/04 단위) 3. UserController /me token+IntegrationTest(AC-06/07) 4. application.yml+.env AUTH_SECRET(병렬) 5. protocol.ts JoinMsg.token+파싱 6. server.ts join token 결합+authSecret/now 주입(AC-01/02/03/04/05/08) 7. main.ts off 경고(AC-08) 8. web currentUser.ts(AC-10일부) 9. relayClient token+ready 팩토리 10. useCrdtDocument 재획득·authError(AC-09/10) 11. 통합 골든벡터 cross-check. {1,4,5} 병렬, web라인(8→9→10)은 backend(3) 계약 의존.

## 테스트 가능성
- backend: WsTokenService(secret, Clock.fixed) 단위(골든 token 리터럴·exp). IntegrationTest app.auth.secret 고정+$.token 단언, 401 유지.
- relay verifyToken 순수(시각·secret 인자). tokenFixture로 유효/만료/위조. server.test createRelayServer({authSecret,now}) 주입+joinResult close코드 단언(AC-02~05/08), AC-05 recordingStore로 append userId=A.
- web: vi.stubGlobal fetch 200/401. AC-09 fakeTransport emitOpen 2회→ready 2회 호출(재획득). AC-10 401→authError + join 미전송.

## 위험
인코딩 불일치(골든벡터로 차단) · secret 관리(env만, web 미노출) · replay(5분TTL) · clock skew(동일호스트/NTP, leeway 확인사항) · token 평문(wss 가정) · 비대칭 배포(확인사항).

## architect 확인사항(3)
1. 비대칭 배포(relay/backend AUTH_SECRET mismatch): (a)배포순서 문서화[권장] (b)grace fallback[비권장] (c)기타
2. clock skew leeway: (a)없음 `exp>now`[권장] (b)30s leeway (c)기타
3. fetchCurrentUserId 교체 vs 유지: (a)교체(삭제)[권장] (b)유지+추가 (c)기타
