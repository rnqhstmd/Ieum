# PR 컨텍스트 — P6 Presence (아바타 목록)

## 배경
P5(WebSocket relay 2탭 텍스트 수렴)가 main에 머지 완료된 상태다. relay 서버(RoomRegistry)는 이미 room 멤버십과 disconnect 정리(leave)를 추적하고 있어 presence 참여/이탈의 물리적 토대가 갖춰져 있었으나, "누가 지금 이 페이지를 보고 있는지"를 다른 탭에 알리는 기능이 없었다. 노션식 협업에서 접속자 awareness는 협업 맥락 인식의 핵심이다. P6은 relay 위에 이 awareness 레이어를 적층하는 walking skeleton 슬라이스다.

## 요구사항 (walking skeleton 스코프)
- 같은 pageId 협업자의 아바타(표시 이름 + 색상)를 에디터 상단에 실시간 표시.
- 탭 접속 시 다른 탭에 즉시 나타나고, 탭 종료/이탈 시 즉시 사라짐. 신규 탭은 기존 접속자 목록을 즉시 확인.
- 확정 스코프: 아바타 목록만(라이브 커서 US-PRES-02 제외), displayName은 siteId 기반 자동 생성("사용자 #xxxx"), 자기 자신 포함(강조 없음), 동일 이름 다중탭은 색상만으로 구분.
- 제외(후속): 라이브 커서/anchorId, presence 영속화, 실 인증 연동, Playwright e2e, 아바타 이미지.

## 설계 핵심
- presence는 기존 `join` 메시지를 optional `presence:{displayName}`로 확장해 운반(1 round-trip 원자 처리, P5 하위호환).
- self presence는 서버가 발신자에게 회신(서버 할당 color 전달, self/peer 동일 클라 경로). join 반환 Dispatch는 **join-ack가 항상 [0]**이라는 불변식으로 기존 테스트 보존.
- `leave`는 void→Dispatch[]로 변경되어 남은 peer에게 presence-leave 브로드캐스트. 순수 RoomRegistry 패턴 유지(Dispatch[] 반환만, transport 비의존).
- 클라 presence 상태는 DocState와 분리된 별도 `usePresence` 훅(순수 reducer)으로 관리 → op 경로 무영향(AC-9) 구조 보장.
- 검증: Playwright 미설치로 in-memory relay(실 RoomRegistry + FakeTransport) 통합 테스트 + 순수 단위/render 테스트로 AC-1~9를 결정적 검증.

## Audit Summary
- 총 7건 (CRITICAL: 0, HIGH: 1, MEDIUM: 4, LOW: 1) — 신규 차단 결함 없음.
- [HIGH/수용] half-open 연결(close 미발화) 유령 아바타 — heartbeat 미도입, 설계/PRD QE-1에 walking skeleton 범위로 명시 수용. 후속 슬라이스.
- [MEDIUM/수정] displayName 길이 상한(≤64) + 배열 가드 — broadcast 증폭 차단.
- [MEDIUM/수정] presence-update color hex(#RRGGBB) 검증 — inline style 주입 표면 차단.
- [MEDIUM/수정] assignColor 9명+ 슬롯 modulo 순환 테스트 추가.
- 인증은 P5 BR-5 연장(목 처리, displayName 신뢰 중계). XSS는 React 기본 이스케이프로 안전 확인.

## 테스트 증거
- ws-relay 33/33, web 116/116 통과. 양 패키지 tsc 0, build 통과(ws tsc, web next build).
