# 설계서: WS-AUTH-01 — WebSocket 신원위조 방지 (HMAC 서명 토큰)

## 설계 규모
**대형** — backend(Java)·ws-relay(Node)·web(TS) 3개 런타임 신규 인증 메커니즘. 양측 바이트 합의 토큰 포맷 + 신규 6 + 수정 11 + AC 10.

## 확정 결정
HMAC-SHA256 서명 토큰 / join `token` 필드 / `GET /api/users/me` 확장 / AUTH_SECRET 미설정 시 경고+trust-relay / TTL 5분 / 비대칭배포=배포순서 문서화 / clock skew leeway 없음 / fetchCurrentUserId→fetchCurrentUser 교체.

## 아키텍처 — 토큰 발급·검증 흐름
```
[발급 backend] GET /api/users/me(JSESSIONID) → CurrentUserService.requireCurrentUserId()→UUID
  → WsTokenService.issue(userId) (미설정 시 null):
    payloadJson = {"userId":"<uuid>","exp":<now+300초>}   ← 수동 문자열 조립(canonical)
    p   = base64url(UTF-8(payloadJson))                    (패딩 제거)
    sig = base64url(HMAC-SHA256(ASCII(p), AUTH_SECRET))    (서명 입력 = base64url 문자열 p)
    token = p + "." + sig
  → MeResponse{id,email,name,token}
[전송 web] fetchCurrentUser()→{userId,token}|null(null=401→authError)
  → relayClient.join {type,pageId,userId,token,presence}
  → 재연결(onOpen 재발화) 시 ready() 팩토리가 /me 재fetch→새 token (FR-7)
[검증 relay] join:
  let identity = joinMsg.userId;                        // 기본 trust-relay
  if (authSecret) { v=verifyToken(joinMsg.token,authSecret,now()); if(v===null){log;close(4001);return} identity=v.userId }  // join.userId 무시
  if (membershipGate) { if(identity===undefined || !await isMember(identity,pageId)){close(4003);return} }
  connUserId = identity ?? null;                        // op 태깅
```
검증 순서: **token(4001=신원) → 멤버십(4003=인가)**. 멤버십 체크는 **token 도출 identity**로(joinMsg.userId 아님). authSecret 미설정 시 token 단계 skip(기존 100% 보존).

## 변경 범위
**신규(6)**: backend `common/security/WsTokenService.java`·`config/ClockConfig.java`·test `WsTokenServiceTest.java`, relay `src/wsToken.ts`·`tests/wsToken.test.ts`·`tests/tokenFixture.ts`.
**수정(11+설정2)**: backend `user/UserController.java`(MeResponse+token), `application.yml`(`app.auth.secret:${AUTH_SECRET:}`), test `UserMeIntegrationTest.java`. relay `protocol.ts`(JoinMsg.token+파싱), `server.ts`(join 게이트 token 결합 M2+authSecret/now), `main.ts`(AUTH_SECRET 로드·off 경고), `tests/server.test.ts`. web `currentUser.ts`(fetchCurrentUserId 삭제→fetchCurrentUser), `relayClient.ts`(token 동반+ready 팩토리+catch M4), `useCrdtDocument.ts`(token·재fetch M1·authError), `components/editor/EditorContainer.tsx`(authError UI M3), `realtime/protocol.ts`(JoinMsg.token), test(currentUser·useCrdtDocument). 설정 `.env.example`(AUTH_SECRET; web .env 변경 없음; ws-relay/.env README 명시).
**무라이브러리**: JDK Mac/Base64, Node crypto.

## 토큰 포맷 명세 (양측 바이트 정합)
형식: `base64url(payload).base64url(HMAC_SHA256(ASCII(p), secret))`
- payload JSON `{"userId":"<uuid>","exp":<정수>}` — **수동 문자열 조립**(Jackson 등 직렬화 미사용), 키 순서 userId→exp 고정.
- userId=`UUID.toString()`(소문자 36자). exp=epoch초 `now+300`(backend `clock.instant().getEpochSecond()+300`, relay `Math.floor(Date.now()/1000)`).
- payload 인코딩 UTF-8→base64url 패딩제거(Java `Base64.getUrlEncoder().withoutPadding()`, Node `Buffer.from(json,'utf8').toString('base64url')`).
- 서명 입력 = base64url 문자열 p의 ASCII 바이트. 서명 = HMAC-SHA256(ASCII(p), UTF-8(secret))→base64url 패딩제거.
- 구분자 `.` 정확히 1개. relay 검증순서: ①split 2분할 ②HMAC 재계산+`timingSafeEqual`(길이 선검사) ③payload decode+JSON.parse(proto 가드) ④`exp>now`(leeway 없음) ⑤userId string≤64.
- **골든벡터 SSOT(순환 위험 차단)**: 기대 token 리터럴을 **구현 코드와 독립 산출**(python)해 양측에 박제. 두 구현이 동일 정본 통과로 바이트 정합 검증(구현이 기대값 안 만듦).

**골든벡터 정본(확정 — Python `hmac/hashlib/base64`로 산출, 구현 독립):**
```
SECRET  = test-secret-key-32-bytes-long!!
USERID  = 11111111-1111-1111-1111-111111111111
EXP     = 1700000300
PAYLOAD = {"userId":"11111111-1111-1111-1111-111111111111","exp":1700000300}
TOKEN   = eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9.sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs
```
산출 명령(재현용): `python -c "import hmac,hashlib,base64,json; s='test-secret-key-32-bytes-long!!'; p=base64.urlsafe_b64encode(b'{\"userId\":\"11111111-1111-1111-1111-111111111111\",\"exp\":1700000300}').rstrip(b'='); sig=base64.urlsafe_b64encode(hmac.new(s.encode(),p,hashlib.sha256).digest()).rstrip(b'='); print(p.decode()+'.'+sig.decode())"`
- backend `WsTokenServiceTest`(Clock.fixed(exp-300=1700000000) + secret 고정) → `issue(USERID)` == TOKEN 단언.
- relay `wsToken.test.ts`/`tokenFixture.ts`에 동일 리터럴 박제 → `verifyToken(TOKEN, SECRET, 1700000299)`=={userId:USERID}, `verifyToken(TOKEN, SECRET, 1700000301)`=null(만료).

## 컴포넌트 설계
**1) WsTokenService.java + ClockConfig.java**: `@Configuration @Bean Clock clock(){return Clock.systemUTC()}`(backend Clock 빈 없음→신규). `WsTokenService(@Value("${app.auth.secret:}") secret, Clock clock)`: `enabled=secret!=null&&!isBlank`, 미설정 log.warn. `String issue(UUID)`(미설정 null, exp=clock+300, payload 수동조립). `base64Url`/`hmacSha256(Mac HmacSHA256)`. 단위테스트 `Clock.fixed` 주입.
**2) UserController**: `record MeResponse(UUID id,String email,String name,String token)`. me()→`wsTokenService.issue(user.getId())`(미설정 null). 미인증 401 불변.
**3) wsToken.ts**: `verifyToken(token?:string, secret:string, now:number): {userId}|null` 순수. createHmac+timingSafeEqual(길이 선검사 try/catch), base64url decode→JSON.parse(proto 가드)→exp>now→userId≤64.
**4) protocol.ts(relay)**: JoinMsg.token? + parse(MAX_TOKEN=512, 형식만, 모든 return 경로 동반).
**5) server.ts(M2 핵심)**: `createRelayServer({...,authSecret?, now?})`. join 게이트: identity=joinMsg.userId 기본 → authSecret 설정 시 verifyToken→null이면 close(4001)+warn, 성공 identity=v.userId → membershipGate 있으면 isMember(identity) 실패 close(4003) → connUserId=identity. **token 검증·connUserId 도출을 if(membershipGate) 블록 밖**. 조합: authSecret만=token검증+멤버십skip / 양측off=trust-relay. close(4001)>close(4003) 우선.
**6) main.ts**: `authSecret=process.env.AUTH_SECRET||undefined`, 미설정 경고. createRelayServer 주입.
**7) currentUser.ts**: fetchCurrentUserId 삭제, `fetchCurrentUser():{userId,token:string|null}|null`(200→{userId,token}, 401/오류→null).
**8) relayClient.ts(M1·M4)**: opts `getToken?`, `ready?:()=>Promise`(팩토리). join에 userId·token 동반. onOpen: `opts.ready().then(()=>join(pageId)).catch(()=>{/*인증실패: join skip, 소켓 close 안 함(idle), authError는 훅 노출*/})`. **M4: reject 시 unhandled 방지+join 미전송+idle(재연결루프는 close에서만)**.
**9) useCrdtDocument.ts(M1·QE-2)**: userIdRef·tokenRef·`authError` state. `fetchAuth=useCallback(async()=>{ me=await fetchCurrentUser(); if(me===null){setAuthError(true);refs=undefined; throw} setAuthError(false); userIdRef=me.userId; tokenRef=me.token??undefined }, [])`. createRelayClient(..., {getUserId,getToken,ready:fetchAuth}). **M1: ready 팩토리가 매 onOpen마다 /me 새 fetch→tokenRef 갱신(캐시 재사용 금지)**. AC-09는 "fetch 2회+2번째 join 새 token" 단언. UseCrdtDocumentResult에 authError 추가.
**10) EditorContainer.tsx(M3)**: `const {...,authError}=useCrdtDocument(pageId)`. `{authError && <div role="alert" data-testid="auth-error">세션 만료. <a href="/login">다시 로그인</a></div>}`. AC-10 노출 주체.
**11) protocol.ts(web)**: JoinMsg.token?.

## 의존성·영향도
- 새 라이브러리 없음(JDK Mac/Base64, Node crypto). WS-AUTH-02/03/04는 connUserId가 검증값이 되어 정확성 자동 향상(시그니처 불변). MeResponse 필드 추가=web token만 추가 소비(하위호환). relayClient ready 타입 변경·fetchCurrentUserId 삭제 호출처=useCrdtDocument 단일.
- 하위호환(BR-6): 양측 AUTH_SECRET 미설정 시 trust-relay 100% 보존(AC-08).

## 구현 순서 (RGR→AC)
1. [Must] 골든벡터 정본 산출 + WsTokenService.java + ClockConfig.java + WsTokenServiceTest (없음) → AC-06일부
2. [Must] relay wsToken.ts verifyToken + tokenFixture.ts + wsToken.test.ts (1 정본 공유) → AC-02/03/04 단위
3. [Must] UserController /me token + UserMeIntegrationTest (1) → AC-06/07
4. [Must] application.yml + .env.example AUTH_SECRET (병렬)
5. [Must] protocol.ts(relay) JoinMsg.token+파싱 (없음) → 파서 단위
6. [Must] server.ts join 게이트 token 결합(M2)+authSecret/now (2,5) → AC-01/02/03/04/05/08
7. [Must] main.ts AUTH_SECRET off 경고 (6) → AC-08
8. [Must] web currentUser.ts fetchCurrentUser 교체+test (3 계약) → AC-10일부
9. [Should] relayClient.ts token+ready 팩토리+catch(M4) (8) → AC-03 전송
10. [Should] useCrdtDocument.ts token·재fetch(M1)·authError+test (9) → AC-09/10
11. [Should] EditorContainer.tsx authError UI(M3) (10) → AC-10 노출
12. [Should] 통합 골든벡터 cross-check + 시작 로그 (6,7)
{1,4,5} 병렬. web 라인(8→9→10→11)은 backend(3) 계약 의존, relay 라인(2→6→7)과 병렬.

## 위험·트레이드오프
- **인코딩 불일치**: 골든벡터 SSOT(구현 독립 정본 양측 단언) + payload 수동조립.
- **비대칭 배포(backend token=null + relay authSecret 설정 = 전면 close(4001) 장애)**: 배포순서 문서화(backend AUTH_SECRET 먼저→relay 나중), grace 안 함. **운영 가이드: 두 서비스 AUTH_SECRET 동시·동일 주입, 한쪽만 설정 금지 체크리스트**.
- **clock skew**: leeway 없음(`exp>now`), 동일호스트/NTP+TTL 5분 흡수, 드문 조기거부는 재연결 재fetch로 자가복구.
- **secret 관리**: env만, web 미노출(token만). **replay**: 5분 TTL(nonce 제외). **평문 전송**: wss 가정.

## 확인이 필요한 사항
추가 확인 사항 없음. 설계가 완료되었습니다.

---

## Testability 평가 (test-architect)

**Testability Score: 8/10 — ✅ PASS (≥7)**. RGR 진입 가능.

### 컴포넌트별 격리 전략 (red-writer 참조)
- **WsTokenService(backend)**: `WsTokenService(secret, Clock.fixed(고정 Instant,UTC))` 생성자 주입 → exp 결정론. issue 결과를 골든벡터와 단언, secret="" 시 null. 외부 의존 0(JDK Mac). **Clock 빈 신규 등록 필수**(ClockConfig). 단위 10/10.
- **UserMeIntegrationTest**: 기존 AbstractIntegrationTest(testcontainers)+oauth2Login. `app.auth.secret` test 고정 주입. `$.token` **형식+서명 재검증** 단언(리터럴 고정은 단위에 위임), 401 유지. 9/10.
- **verifyToken(relay)**: `(token, secret, now)` 순수 — 만료/위조/부재 인자 결정론. tokenFixture로 유효/만료/위조 생성. timingSafeEqual 길이불일치 throw→try/catch null. proto 가드 null. 10/10.
- **wsToken.test 골든벡터**: backend와 동일 정본 리터럴 양측 단언. **정본은 구현 독립 산출(SSOT)** — fixture 주석에 산출 명령 박제(순환 차단). 7/10(정본 산출 주체 명시 필요 → design 반영됨).
- **server.test(실ws)**: `createRelayServer({authSecret,now})` 주입(기존 opStore/membershipStore DI 정합). joinResult 헬퍼에 token 전달 추가. AC-05는 recordingStore로 append userId=token.userId(=A) 단언. close(4001) negative ack는 setTimeout 대기. 9/10.
- **tokenFixture.ts**: 신규, 기존 테스트 import 안 함→컴파일 무영향. 10/10.
- **currentUser.ts**: vi.stubGlobal fetch 200/401. fetchCurrentUserId 교체로 기존 3테스트 시그니처 수정. 9/10.
- **relayClient.ts**: fakeTransport emitOpen 2회→ready 팩토리 2회. 8/10.
- **useCrdtDocument.ts**: renderHook+transportFactory 직접 주입(retryingTransport 우회 결정론). AC-09=emitOpen 2회→fetch 2회+2번째 join 새 token. AC-10=fetch 401→authError true+fake.sent에 join 부재. 7/10(ready throw→join 차단+authError 신규 제어흐름, fake 재연결 모사 단순화).

### AC별 검증 레이어
| AC | 레이어 | RED |
|----|--------|:---:|
| AC-01 정상 join·태깅 | ws-relay 실ws(server.test) | ✅ |
| AC-02 token 부재→4001 | ws-relay + verifyToken 단위 | ✅ |
| AC-03 위조→4001 | ws-relay + verifyToken 단위 | ✅ |
| AC-04 만료→4001 | ws-relay(now 주입) + 단위 | ✅ |
| AC-05 사칭(join.userId≠token) | ws-relay(recordingStore) | ✅ |
| AC-06 /me token 반환 | backend 통합 + WsTokenServiceTest + relay 골든 | ✅(정본 SSOT 반영) |
| AC-07 미인증 401 | backend 통합 | ✅ |
| AC-08 secret 미설정 trust-relay | ws-relay(authSecret 미주입) | ✅ |
| AC-09 재연결 재획득 | web(emitOpen 2회→fetch 2회) | ✅(ready 팩토리=매번 fetch 반영) |
| AC-10 401 authError+join 미시도 | web(fetch 401) | ✅(authError throw+EditorContainer UI 반영) |

### 비차단 권고(설계 반영됨)
1. 골든벡터 정본 SSOT 산출 명시 → 토큰 포맷 명세에 반영. 2. ready 팩토리=매 fetch + authError throw 경로 + EditorContainer 노출 → M1/M3/M4 반영. 3. ClockConfig 빈 등록 → 변경범위 반영.
