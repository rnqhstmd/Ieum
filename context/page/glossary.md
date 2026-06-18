# 페이지·에디터 용어 사전

| 용어 | 설명 |
|------|------|
| Page | 워크스페이스 내 단일 문서 단위. 제목(title), 아이콘(icon), 위치(position), 콘텐츠(CRDT 상태)를 갖는다. |
| parentPageId | Page의 자기참조 외래키. null이면 워크스페이스의 루트 페이지. 중첩 트리를 구성하는 핵심 필드. |
| 페이지 트리 | parentPageId + position으로 형성되는 계층 구조. 워크스페이스 사이드바에서 탐색 가능. |
| 루트 페이지 | parentPageId = null인 페이지. 워크스페이스 최상위에 위치. |
| 무한 중첩 | 페이지 깊이에 상한을 두지 않는 설계 원칙. MVP 실용 범위 내에서 허용. |
| position | 같은 부모를 공유하는 형제 페이지 사이의 정렬 순서를 나타내는 정수 필드. gap-based 전략으로 관리. |
| gap-based 정렬 | position을 1000 단위 간격으로 초기 할당하고, 중간 삽입 시 두 값의 평균을 사용하는 정렬 전략. 정수이므로 CRDT 레이어의 부동소수점 위치와 혼동하지 않는다. |
| rebalance | 연속 삽입으로 position 간격이 소진될 때, 해당 부모의 자식 목록 전체를 1000 단위로 재배정하는 연산. |
| archivedAt | Soft delete 타임스탬프. null이면 활성 페이지, 값이 설정되면 아카이브된 상태. 쿼리 기본 필터는 `WHERE archivedAt IS NULL`. |
| soft delete | 실제 행을 삭제하지 않고 archivedAt을 현재 시각으로 설정해 논리 삭제하는 방식. 하위 페이지도 재귀적으로 아카이브됨. |
| 재귀 아카이브 | 페이지 soft delete 시 모든 하위 페이지(자식, 자식의 자식…)도 함께 archivedAt을 설정하는 처리. 애플리케이션 레이어 또는 재귀 업데이트로 구현. |
| icon | 페이지 아이콘 필드. 이모지 문자열 또는 이미지 URL을 저장. 이모지 피커 UI는 post-MVP, 직접 입력은 MVP에서 허용. |
| 블록(block) | 에디터 내 콘텐츠의 최소 단위. 각 블록은 타입과 텍스트 내용을 가지며, contenteditable 요소 하나에 대응. |
| 블록 타입 | 블록의 시각적·의미적 종류. MVP 지원 타입: paragraph(단락), heading1·heading2·heading3(제목 1~3), bullet list(글머리 기호 목록). 추가 타입은 post-MVP. |
| contenteditable | 브라우저 내장 편집 가능 속성. Ieum 에디터는 이를 기반으로 블록 단위 구조를 직접 구현. 외부 에디터 라이브러리를 사용하지 않음. |
| 자동저장 | 편집 내용을 저장 버튼 없이 자동으로 반영하는 기능. 단일 사용자 모드에서는 debounce 500ms 후 저장, 협업 모드에서는 CRDT op로 즉시 전송. |
| debounce | 연속 입력 이벤트를 일정 시간(500ms) 동안 누적한 뒤 마지막 이벤트 기준으로 한 번만 처리하는 기법. 자동저장 빈도를 제어하기 위해 사용. |
| RGA CRDT | Replicated Growable Array Conflict-free Replicated Data Type. 에디터 콘텐츠의 실시간 협업 수렴을 보장하는 자체 구현 알고리즘. 에디터 콘텐츠는 이 상태에서 파생(렌더링)됨. collaboration 도메인에서 **2-level 블록 RGA**로 구현: 상위 RGA(블록 순서) + 각 블록별 하위 RGA(문자 수준). |
| siteId | 편집 클라이언트(세션)별로 생성되는 UUID. RGA CRDT에서 op의 전역 고유성을 보장하는 식별자. |
| CrdtOp | 페이지 콘텐츠에 대한 편집 연산 로그 레코드. INSERT 또는 DELETE op 타입과 RGA payload를 가지며 append-only로 저장. |
| Snapshot | 특정 시점의 페이지 RGA 상태 전체를 직렬화한 레코드. 신규 접속 시 재생(replay) 비용을 줄이기 위해 주기적으로 생성. |
