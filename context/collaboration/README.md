# 실시간 협업 (collaboration)

외부 라이브러리 없이 자체 구현한 RGA CRDT 기반으로 여러 사용자가 같은 페이지를 동시에 편집해도 모든 replica가 동일한 최종 상태로 수렴하는 실시간 공동편집 및 presence 시스템.

## 배경

여러 사용자가 같은 문서를 동시에 편집하면 편집 충돌이 발생한다. 중앙 잠금 방식은 UX가 최악이고, OT(Operational Transformation)는 변환 함수 복잡도가 폭발적으로 증가하며 중앙 서버가 필수다.

Ieum은 **RGA(Replicated Growable Array) CRDT**를 직접 구현해 이 문제를 해결한다. RGA는 수학적으로 수렴이 보장된 자료구조로, relay 서버가 단순 op 중계만 해도 모든 클라이언트가 같은 상태로 수렴한다. 중앙 변환 로직이 없으므로 서버 수평 확장과 재접속 시나리오도 자연스럽게 지원된다.

MVP부터 **2-level 블록 RGA** 구조(외부: 블록 리스트 RGA, 내부: 블록별 인라인 텍스트 RGA)로 구현하며, paragraph/heading1~3/bullet list 블록 타입을 지원한다. `siteId`는 편집 세션/탭마다 생성되는 UUID로 CRDT 수렴용 식별자이며, 사용자 신원(`userId`)은 WebSocket 연결 시 JWT 인증으로 별도 확인한다.

**외부 CRDT 라이브러리(Yjs 등) 사용 금지**가 프로젝트 정책이며, `packages/crdt`는 `dependencies`가 비어 있어야 한다. 전 과정을 TDD로 검증한다.

## 안 하면 어떻게 되는가

- 동시 편집 시 한 사용자의 변경이 다른 사용자의 변경을 덮어씀(last-write-wins 충돌)
- 네트워크 지연이 있을 때 사용자마다 다른 텍스트를 보게 됨
- 협업 기능 자체가 불가능해지며 Notion 유사 서비스의 핵심 차별점 상실

## 사용자와 규모

같은 페이지에 동시 접속하는 편집자들이 주 사용자다.

| 지표 | 목표 | 출처 |
|------|------|------|
| 동시 접속자 (MVP 목표) | 워크스페이스당 10명 | PRD §비기능요구사항 |
| CRDT op 브로드캐스트 지연 | p95 < 300ms (로컬 환경) | PRD §비기능요구사항 |
| presence 업데이트 지연 | p95 < 300ms (로컬 환경) | PRD §비기능요구사항 |

## 성공 기준

| 기준 | 상태 |
|------|------|
| 2인 이상 동시 편집 시 모든 클라이언트가 동일한 최종 텍스트로 수렴 | ⬜ |
| 동일 위치 동시 삽입이 결정론적 순서(siteId tie-break)로 해소됨 | ⬜ |
| presence 커서가 RGA 노드 id로 앵커링되어 다른 사용자의 편집 후에도 올바른 위치 유지 | ⬜ |
| 재접속 후 Snapshot + delta replay로 편집 내용 유실 없음 | ⬜ |
| CRDT 단위 테스트: INSERT/DELETE/동시 삽입 충돌/tombstone 등 주요 경로 커버 | ⬜ |
| Playwright e2e: 브라우저 2개에서 동시 편집 후 양쪽 텍스트 동일 확인 | ⬜ |
| packages/crdt의 외부 의존성 0 유지 | ⬜ |

> ✅ Snapshot 생성 트리거 임계값 확정: **1,000 op 또는 24시간** 중 먼저 도달하는 조건으로 통일한다(07-collaboration-crdt.md §6-3 기준). 05-data-model.md도 1,000 op로 수정 완료.

## 담당자

| 역할 | 이름 | 비고 |
|------|------|------|
| PM/PO | rnqhstmd | 1인 개발 |
| 개발 리드 | rnqhstmd | |

## 현재 상태

기획 완료 · 구현 전 (Phase 2 CRDT / Phase 3 Presence)
