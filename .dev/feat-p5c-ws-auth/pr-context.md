# PR 컨텍스트 — P5 후반 WS 인가

## 배경
P5/P6 realtime는 BR-5 mock 인증(siteId 신원)으로 누구나 임의 page에 op를 영속/중계할 수 있었다(슬라이스1 교차 room 인가 공백). 이 PR은 mock→실 신원으로 나아가 **실 userId 기반 멤버십 인가**(WS-AUTH-02) + **op에 서버 userId 태깅**(WS-AUTH-03)을 도입한다. 전제 격차(웹에 실 userId 없음)를 3계층으로 메운다.

## Audit Summary
- 총 4건 (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 2 / Quality 0)
- [RISK/MEDIUM] trust-relay userId 미검증 — 클라 주장 userId 신뢰(사용자가 선택한 모델, displayName 동형). 127.0.0.1 바인딩 containment. 신원 위조방지는 명시적 out-of-scope·후속.
- [RESOLVED] 슬라이스1 교차 room op 영속화 공백 → connPage 게이트로 마감(AC-7).
- [RISK/LOW→수정] userId fetch 레이스 → relayClient `ready`로 join을 fetch 완료 후로 미뤄 제거.
- [POLICY/LOW] WS-AUTH-04(멤버 제거 강제종료) → P7 의존 연기. WS-AUTH-05(64KB) 기구현.
- 검증: ws-relay 72, web 141, backend gradle BUILD SUCCESSFUL(testcontainers V1~V4), tsc 0(×2), web build ✓.
