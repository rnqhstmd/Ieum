# Trust Ledger — P2 잔여 (이름변경·아이콘·아카이브)

## 통합 감사 (review)

- [POLICY/통과] 서버측 권한 강제
  - 근거: `updatePage`/`archivePage` 모두 진입 즉시 `accessGuard.requireWorkspaceMember`(비멤버 403) + `page.workspaceId` 일치 검사(타 WS 400) + 존재 검사(404). 프론트 confirm은 UX일 뿐 신뢰 경계 아님.
  - 권고: 유지. 통합 테스트 AC-I3(비멤버 PATCH/DELETE 403)로 배선 검증됨.

- [POLICY/통과] 부분 갱신 안전
  - 근거: updatePage는 null 필드 무시(미전달 보존). blank title은 400. 임의 필드 덮어쓰기 없음.

- [RISK/LOW→방어] 재귀 아카이브 무한 루프
  - 근거: BFS에 `seen` 집합 + 활성목록 기반 child map. createPage가 부모 사전존재 강제(DAG)라 사이클 없음. 방어적으로 seen으로 재방문 차단.
  - 권고: 없음(유계 보장).

- [INFO] 아이콘 문자열 비검증 저장
  - 근거: icon은 사용자 입력 문자열을 그대로 저장. React가 텍스트 노드로 렌더(자동 이스케이프)하므로 XSS 안전. 길이는 프론트 maxLength=8로 완화.
  - 권고: 서버측 길이/형식 검증은 후속(현재 위험 낮음).

- [INFO] icon 비우기(clear) 미지원
  - 근거: PATCH null=변경없음 의미라 아이콘 제거 불가(범위 밖). 의도된 한계.

- [ASSUMPTION] updatePage/archivePage는 @Transactional 더티체킹 대신 명시 save/saveAll 사용
  - 근거: 단위 테스트가 save 인자를 캡처해 검증하므로 명시 저장. 동작 동일, 테스트 가시성 ↑.

### 합산
CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1(재귀 — 방어됨) · INFO 3. **차단 항목 없음.**
