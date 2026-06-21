# Trust Ledger — P6 Presence (아바타 목록)

## 통합 감사 (review) — security-auditor

신규 CRITICAL 0 / HIGH 1 / MEDIUM 4 / LOW 1. 모든 HIGH 이상은 walking skeleton 수용 범위. 교차검증 결과 FR-1~7·BR-2~6·AC-1~9·설계결정(join-ack[0]·self회신·M1 순서·color 서버할당)·proto 가드 전건 정합.

| # | 분류/심각도 | 항목 | 위치 | 권고 |
|---|------------|------|------|------|
| S1 | GAP/HIGH | half-open 연결(close 미발화) 시 유령 아바타 잔존 | server.ts close 핸들러 / room.ts presence | **수용(문서화)** — heartbeat 미도입, 설계/PRD QE-1에 명시. 후속 슬라이스. |
| S2 | RISK/MEDIUM | displayName 길이 상한 없음 — 64KiB payload 중 대부분을 displayName으로 채워 broadcast 증폭 가능 | ws protocol.ts parseClientMessage / room.ts resolveDisplayName | parseClientMessage join에서 displayName 길이 상한(예 ≤64) 권장 |
| S3 | GAP/MEDIUM | color hex 포맷 미검증 — parseServerMessage가 typeof string만 확인, inline style 주입 표면 | web protocol.ts parseServerMessage presence-update | `/^#[0-9A-Fa-f]{6}$/` 검증 권장(서버 할당이라 실질 위험은 낮음) |
| S4 | GAP/MEDIUM | assignColor 9명+ 슬롯 순환(modulo) 경로 미테스트 | room.ts assignColor / AC-6 테스트 | AC-6 테스트를 9명 시나리오로 확장 권장 |
| S5 | ASSUMPTION/MEDIUM | useCrdtDocument useEffect deps에서 presence 콜백/displayName 제외 — 현재 안정(useCallback []) 확인됨, 미래 usePresence 변경 시 stale 위험 | useCrdtDocument.ts | 안정성 보장 주석 보강 |
| S6 | RISK/LOW | initialOf의 displayName 다중 '#' 시 의도치 않은 이니셜 | PresenceAvatars.tsx | displayName 서버측 형식 검증으로 근본 해소(S2와 연동) |

부수: presence가 배열로 올 때 `typeof==='object'` 통과(Array.isArray 미검사) — displayName undefined로 presence 없이 join 반환(무해), 의도 주석 부재.

### XSS/스푸핑 교차검증 (안전 확인)
- displayName 렌더(initialOf/aria-label/title): React 기본 이스케이프 + dangerouslySetInnerHTML 미사용 → XSS 없음.
- color 클라 주입: parseClientMessage가 presence.color를 추출하지 않음 → 클라 주입 경로 없음(서버 PRESENCE_COLORS 할당).
- presence-leave/update 위조: ClientToServer = Join|Op만, 그 외 parseClientMessage default null → clientId 스푸핑 차단.

## 코드 품질 (review) — quality-reviewer

**QUALITY PASS** (Critical 0 / Important 2 / Minor 3).
- Important Q1: assignColor modulo 재사용(8명 초과 동일색 중복)이 정본(07:538) 의도인지 코드만으론 불명확 → 의도 주석 권고.
- Important Q2: PresenceInfo/parse 계약이 ws·web 양측 복제(DRY) → 파일 주석에 "복제는 walking skeleton 의도" 명시됨. 후속 공유패키지화 우선 대상 메모.
- Minor: findIndex `_` 미사용 가독성 / initialOf 빈 입력 빈 배지(현 경로 도달불가) / displayName 포맷 매직문자열 분산.

## 수용 항목 (P5 trust-ledger 연장)
- 인증 미적용(BR-2/5, displayName 신뢰 중계) — walking skeleton 목 처리. presence 메시지도 동일.
- half-open 유령 아바타(S1) — 정상 close 기반, heartbeat 후속.
- 127.0.0.1 바인딩·maxPayload 64KiB·연결 100상한·proto 가드 — presence 경로도 동일 가드 적용 확인.

## 처리 결과 (사용자: 핵심 방어 수정 + 나머지 문서화)
- **S2 수정**: ws protocol.ts — displayName 길이 상한 `MAX_DISPLAY_NAME=64`(초과 시 버리고 익명 흡수) + `!Array.isArray(presence)` 방어. 테스트 2건 추가.
- **S3 수정**: web protocol.ts — parseServerMessage presence-update color를 `/^#[0-9A-Fa-f]{6}$/` 검증. 테스트 1건 추가.
- **S4 수정**: room.presence.test — 9명+ 슬롯 modulo 순환 테스트 추가(미검증 경로 커버).
- **Q1 수정**: room.ts assignColor modulo 라인 의도 주석.
- **S5 주석**: useCrdtDocument deps 안정성(useCallback[]·useRef 파생) 명시.
- **수용/문서화**: S1(half-open HIGH — heartbeat 후속), Q2(PresenceInfo 복제 — 공유패키지화 후속 메모), S6/LOW(initialOf 다중#는 S2 길이상한으로 완화).
- 재검증: ws-relay 33/33, web 116/116, 양 tsc 0. 회귀 0.
