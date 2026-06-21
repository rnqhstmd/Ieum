# Trust Ledger — P4 CRDT 코어 (인라인 RGA)

## 통합 감사 (review)

대상은 순수 로직 라이브러리(`packages/crdt`, 의존성 0, 네트워크/FS/DOM 접근 없음)로 전통적 보안 표면(인증/인가/주입/시크릿/PII)이 없다. CRDT 정확성·자원 관점 위주로 감사.

- [POLICY/통과] 순수성·의존성 0 준수
  - 근거: `package.json` dependencies 비어 있음, fast-check 미도입(시드 PRNG 자작 property 테스트로 대체). 네트워크/FS/DOM 호출 없음.
  - 권고: 유지. 후속에서도 런타임 의존성 추가 금지.

- [POLICY/통과] siteId ≠ 신원
  - 근거: `types.ts`가 siteId를 "세션 식별자(userId와 별개)"로 명시. 본 패키지는 인증 로직 없음 — 서버(P5)가 ws 연결 userId를 op에 태깅.
  - 권고: P5 relay에서 클라이언트 siteId를 신원 판단에 쓰지 말 것.

- [ASSUMPTION/MEDIUM] deserialize는 스냅샷 무결성을 신뢰한다
  - 근거: `deserializeRga`가 `data.nodes`를 검증 없이 순차 연결(중복 id·순서 오류·사이클 미검증). 악의적/손상 스냅샷은 비정합 상태를 만들 수 있음.
  - 권고: 스냅샷은 서버 생성(신뢰 경로)이라는 전제. P5에서 서버 생성 스냅샷만 deserialize하도록 경계 확정. 필요 시 deserialize에 중복 id·NaN counter 가드 추가(후속).

- [RISK/LOW] orphan op로 인한 버퍼 무한 증가 가능성
  - 근거: `pendingBuffer`(미도착 originId insert)·`pendingDeletes`(미도착 target delete)는 상한 없음. 악의적 peer가 절대 도착 안 할 originId를 가진 op를 대량 전송하면 메모리 증가.
  - 권고: MVP는 인증 연결(P5) 전제로 위험 낮음. post-MVP에서 버퍼 크기 상한·TTL 고려.

- [GAP/INFO·해소] delete 인과성
  - 근거: 설계 초안의 "missing-target delete = no-op" 가정이 property 테스트로 반증됨(임의 재배열에서 교환법칙 위반). → `pendingDeletes` 인과 버퍼링으로 교정 완료(구현 반영).
  - 권고: 없음(해소됨).

- [INFO] 스냅샷은 "적용된 상태"만 저장 (의도된 설계)
  - 근거: `serializeRga`는 nodeMap에 적용된 노드만 직렬화. `pendingBuffer`/`pendingDeletes`(미적용 transient)는 직렬화하지 않음 — 07 §6-3 모델대로 재접속 시 op 로그 replay로 재구성(AC-20 검증). 분기 아님.

### 합산
CRITICAL 0 · HIGH 0 · MEDIUM 1(ASSUMPTION: 스냅샷 신뢰) · LOW 1(버퍼 상한) · INFO 2. **차단 항목 없음.** MEDIUM/LOW는 모두 P5(relay/서버) 경계에서 처리할 후속 항목으로, 현 인라인 RGA 코어 범위에서는 수용 가능.
