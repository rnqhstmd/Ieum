# Trust Ledger — P1 인증·권한

## 통합 감사 (review 1차)

### 수정 대상 (RGR 사이클로 반영)
- **[RISK/CRITICAL] GET 로그아웃 허용** — `SecurityConfig` `.logoutUrl("/api/auth/logout")` + CSRF disabled → Spring Security가 GET/POST 모두 허용. `<img src=.../api/auth/logout>`로 세션 강제 무효화 가능.
  - 권고/조치: POST 전용 매처로 변경.
- **[RISK/CRITICAL→하드닝] open-redirect 벡터** — callbackUrl 검증 `startsWith("/") && !startsWith("//")`이 `/\evil.com`, `/%2F%2Fevil.com` 통과.
  - 분석: 실제로는 `frontendUrl`(절대 URL)을 항상 prefix하므로 목적지 호스트가 frontendUrl로 고정 → 진짜 오픈 리다이렉트는 성립 어려움. 그러나 방어심층화로 백슬래시·인코딩 거부 추가.
- **[QUALITY/Important] OAuth2SuccessHandler catch(Exception) 로깅 부재** — 로그인 후처리 실패 원인 진단 불가. → log.warn 추가.
- **[QUALITY/Important] WorkspaceService 죽은 스텁** — requireWorkspaceMember/requireOwner가 UnsupportedOperationException, 호출처 없음, AccessGuard가 실제 SSOT. → 제거.
- **[QUALITY/Important] 세션쿠키 설정 이중화** — application.yml과 SessionCookieConfig.java가 HttpOnly/SameSite 중복. → 단일 소스 통합.
- **[RISK/HIGH] 403/404 메시지 정보 노출** — AccessDeniedException.getMessage()("OWNER 권한이 필요합니다")가 응답에 노출. → 일반 메시지.

### 오탐 (조치 불필요)
- **[RISK/HIGH] tools.jackson import** — Spring Boot 4.1.0은 Jackson 3.x(`tools.jackson.*`)를 번들. 빌드 성공 + 47 테스트 통과로 정상 확인. 오탐.

### 수용된 위험 / 문서화 (운영·후속)
- **[RISK/HIGH→수용] ensurePersonalWorkspace DataIntegrityViolationException 미catch** — 설계 초안의 in-tx catch는 트랜잭션 rollback-only 의미상 부정확. **V2 partial UNIQUE 인덱스(`uq_workspaces_owner_personal`)가 "PERSONAL WS ≤ 1" 불변식을 DB 레벨로 절대 보장**(AuthIntegrationTest 6스레드 실증, count==1). 동시 최초로그인 더블탭(극희소)은 1스레드가 23505→500→재시도 시 성공. 수용. design.md 정합화.
- **[RISK/HIGH→운영] 세션 Secure 기본 false** — 로컬 HTTP 개발용 기본값. 운영은 `SESSION_COOKIE_SECURE=true` 환경변수 필수(배포 게이트). BR-6 충족은 운영 설정 책임.
- **[GAP/MEDIUM→P2] 컨트롤러 currentUserId=null 16곳 미연결** — AccessGuard/CurrentUserService는 구현·단위검증 완료. 컨트롤러 연결은 P2(페이지/워크스페이스 API 본구현)에서. 현재 서비스 메서드가 전부 P2 스텁이라 인증 사용자가 호출 시 500(노출 데이터 없음). 권한 우회 위험은 데이터 핸들러 부재로 미발생.
- **[GAP/MEDIUM→P2] FilterChain AccessDeniedHandler 미등록** — P1은 메서드 시큐리티 미사용이라 필터단 403 미발생. P2 @PreAuthorize 도입 전 accessDeniedHandler 추가 TODO.
- **[ASSUMPTION/MEDIUM→P2 프론트] callbackUrl state 전달** — 백엔드는 콜백 시 `?callbackUrl=` 파라미터를 읽음. OAuth state 인코딩 전달은 프론트 OAuth 진입 URL 구성(P2 프론트 협업)에서 보장 필요. 백엔드 단위 동작은 검증됨.
- **[GAP/MEDIUM→하드닝] session-fixation 명시** — Spring Security 기본 migrateSession 의존. 명시 선언은 후속 하드닝.

## 통합 감사 (review 2차 — 수정 검증)

### 해소 확인
- ✅ GET 로그아웃(CRITICAL) — SecurityConfig POST 전용 매처 + GET→405 필터. 해소.
- ✅ 403/404 메시지 노출(HIGH) — 고정 문자열 응답, 내부 메시지는 로그만. 해소.
- ✅ OAuth catch 로깅 / WorkspaceService 죽은 스텁 제거(grep 확인 호출 없음) / 세션쿠키 단일화. 해소.

### 2차에서 제기된 신규 항목 — 트리아지
- **open-redirect 잔여 벡터(%09 탭, 유니코드 ∕)** → ✅ **조치**: `resolveRedirect`를 엄격 화이트리스트 정규식 `/[A-Za-z0-9/_-]*` + `!startsWith("//")`로 교체. 모든 우회 벡터 차단(+ frontendUrl 절대 prefix로 호스트 고정이 1차 방어). 기존 테스트 유지.
- **SessionCookieConfig Secure 누락(HIGH)** → ❌ **오탐**: application.yml:7 `secure: ${SESSION_COOKIE_SECURE:false}` 잔존(Tomcat이 실 Set-Cookie에 적용). HttpOnly/SameSite=SessionCookieConfig, Secure=yml, timeout=yml — 각 단일 소스. 누락 아님.
- **IllegalArgumentException 400 메시지 노출(HIGH)** → 📝 **의도(수용)**: 400은 사용자 입력 검증 피드백이라 메시지 노출이 정상 UX. authz/리소스 존재 누설 아님(403/404와 성격 다름). 유지.
- **WorkspaceService 스텁 "미해소"** → ✅ **오인**: 스텁 메서드는 제거됨. P2 서비스 메서드 내 TODO 주석을 오인한 것.

### 최종 보안 상태
- 미해소 CRITICAL/HIGH(실제): 0. open-redirect는 화이트리스트로 종결. 나머지는 오탐·의도·P2.
