# PRD: P5 후반 자동저장 배선 (US-EDIT-02 — 제목 영속화)

## 배경
US-EDIT-02는 두 부분이다 — (1) "협업 시 CRDT op 즉시 전송"은 **슬라이스1(op 영속화)에서 완료**(블록 본문 op가 relay→crdt_ops 즉시 영속), (2) "debounce 500ms 후 자동저장"은 **제목(pages.title)** 용 save-port가 P3(PR #8)에서 메커니즘만 구현되고 영속화는 no-op 스텁으로 남아 있다(`EditorContainer.tsx:33`). 이 슬라이스는 **제목 자동저장 save-port를 실제 영속화에 연결**한다.

전제 격차: 제목 PATCH(`PATCH /api/workspaces/{wsId}/pages/{pageId}`)는 이미 있으나 wsId 경로가 필요하고, page.tsx는 pageId만 가지며 **단일 페이지 GET 엔드포인트가 없다**(PageController는 전부 wsId-scoped 트리/CRUD). 따라서 단일 페이지 조회를 신설해 제목·wsId 초기값을 로드한다.

## 범위
### In-Scope
- **백엔드 `GET /api/pages/{pageId}`** — 멤버십 검증(`AccessGuard.requirePageAccess`) 후 `{id, title, icon, workspaceId}` 반환. 비멤버 403, 미인증 401.
- **EditorContainer**가 마운트 시 단일 페이지 GET으로 title·workspaceId 로드(초기 title 반영).
- **제목 save-port** no-op 스텁 → `apiPatch('/api/workspaces/{wsId}/pages/{pageId}', {title, icon})` 실제 호출. 성공 시 status 'saved'.

### Out-of-Scope
- 블록 본문 영속화(슬라이스1 완료), 아이콘 피커, Snapshot(P8), 재접속 복원(P8).

## 요구사항
### [Must]
- **M1**: `GET /api/pages/{pageId}`가 멤버에게 `{id,title,workspaceId}`를 반환하고, 비멤버는 403, 미인증은 401이다.
- **M2**: 제목 변경이 debounce(500ms) 후 `PATCH`로 영속화되고 pages.title이 갱신된다.
- **M3**: EditorContainer가 단일 페이지 GET으로 초기 title을 로드해 표시한다.
### [Should]
- **S1**: 저장 성공 시 autosave 상태가 'saved'로 표시된다(기존 SaveStatus UI 재사용).
- **S2**: save-port 호출은 워크스페이스 경로(wsId)를 GET 응답의 workspaceId로 구성한다.

## 수용 기준 (Given-When-Then)

### AC-1 — 단일 페이지 GET (멤버) `[Must M1]`
- **Given**: 사용자 U가 page P(워크스페이스 W)의 멤버, 인증 세션 보유
- **When**: `GET /api/pages/{P}`를 호출한다
- **Then**: 200 + body의 `id`=P, `title`=P의 제목, `workspaceId`=W이다

### AC-2 — 단일 페이지 GET (비멤버 403) `[Must M1]`
- **Given**: 사용자 X가 page P의 비멤버, 인증 세션 보유
- **When**: `GET /api/pages/{P}`를 호출한다
- **Then**: 403이 반환된다

### AC-3 — 단일 페이지 GET (미인증 401) `[Must M1]`
- **Given**: 인증 세션 없음
- **When**: `GET /api/pages/{P}`를 호출한다
- **Then**: 401이 반환된다

### AC-4 — 제목 자동저장 영속화 `[Must M2]`
- **Given**: EditorContainer가 page P(workspaceId=W)로 로드된 상태
- **When**: 제목을 "새 제목"으로 바꾸고 debounce(500ms)가 경과한다
- **Then**: save-port가 `apiPatch('/api/workspaces/{W}/pages/{P}', {title:"새 제목", icon:null})`를 1회 호출한다

### AC-5 — 초기 title 로드 `[Must M3]`
- **Given**: page P의 제목이 "기존제목"으로 영속되어 있다
- **When**: EditorContainer가 P로 마운트되어 단일 페이지 GET을 완료한다
- **Then**: TitleEditor에 "기존제목"이 표시된다(GET 응답 title 반영)

### AC-6 — 저장 상태 표시 `[Should S1]`
- **Given**: 제목 변경 후 save-port가 성공적으로 resolve한다
- **When**: 저장이 완료된다
- **Then**: autosave 상태 라벨이 '저장됨'(status 'saved')이 된다

---

## 확인이 필요한 사항
추가 확인 사항 없음. (save-port=제목용, 전제로 단일 페이지 GET 신설, 3계층 배선은 본 PRD 승인으로 확정.)
