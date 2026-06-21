# PR Context: P5 WebSocket Relay Walking Skeleton

## 비즈니스 맥락

P4b(PR #9)에서 2-level 블록 RGA CRDT 코어(`@ieum/crdt`)와 wire codec이 완성됐으나, 에디터는 CRDT 미연결 순수 로컬 상태였고 WebSocket 인프라가 없어 두 탭에서 같은 페이지를 열어도 편집이 전달되지 않았다.

이 PR은 **"단일 op → WebSocket 전송 → 서버 broadcast → 수신 탭 적용 → 화면 반영"** 전 구간을 최소로 동작시키는 walking skeleton이다. 두 브라우저 탭에서 같은 pageId를 열면 한 탭의 인라인 텍스트 편집이 상대 탭에 실시간 수렴한다.

### 범위
- **포함**: relay 서버(`apps/ws-relay`, room=pageId), join/op broadcast(발신자 제외)/op-ack, 클라 송수신 와이어링, 에디터 CRDT(DocState) 연결, 2탭 라이브 수렴.
- **제외(후속)**: CrdtOp DB 영속화·sync/snapshot·재접속 op 복원(P8), presence(P6), 정식 인증(BR-5 목 처리), 블록 단위 op 실시간 전송·구조 편집(Enter/Backspace) 수렴.

## 주요 결정
- WireEnvelope codec(소문자 opType) 그대로 재사용 — relay는 op 불투명 전달, AC-5는 실제 codec 기준.
- 2탭 수렴은 Playwright 미설치로 in-memory relay(실 RoomRegistry + FakeTransport) vitest 통합 테스트로 결정적 검증.
- sync 미구현 보완: 모든 탭이 공유 genesis 블록으로 시작(`createCollaborativeDocument`).
- 구조 편집(Enter/Backspace) 이번 슬라이스 비활성(split 로컬 blockId가 상대 탭 미수렴 유발 → 후속 블록 op 슬라이스).

## 검증
- 테스트: ws-relay 19 + web 94 = **113 pass, 0 fail**. typecheck 0. next build green.
- spec-reviewer SPEC PASS(AC-1~10), quality-reviewer QUALITY PASS, product-owner ACCEPT.

## Audit Summary
- 총 11건 (CRITICAL: 0, HIGH: 4, MEDIUM: 8) — security-auditor 통합 감사
- **수정 완료(7+1건)**: 127.0.0.1 바인딩(localhost 강제), 소켓 error 핸들러(프로세스 크래시 방지), 연결 수 상한, maxPayload 64KiB, room 교차주입 차단, 양방향 parse proto 가드 + 클라 op 봉투 검증, retry dispose 가드
- **수용·문서화**: siteId 스푸핑·prototype pollution 심층·retry 중 op 유실 등은 walking skeleton(localhost, BR-5) 범위로 수용, 코드 주석·trust-ledger에 후속 TODO 기록
