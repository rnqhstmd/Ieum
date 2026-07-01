# PRD: usePageTitle 아이콘 null 덮어쓰기 버그 수정 (hotfix)

## 배경
이음(IEUM) 에디터의 제목 자동저장 훅 `usePageTitle`의 save-port `saveTitle`이 제목을 영속할 때 PATCH 본문에 `{ title, icon: null }`로 **icon 필드를 하드코딩**하여 함께 전송한다. 이 훅은 제목(pages.title)만 책임지는 save-port인데, 자신의 범위 밖인 icon을 매 저장마다 명시적으로 전송한다.

현재 백엔드 `PageService.updatePage`는 부분 갱신 계약(`icon: null` = "변경 안 함", `icon: ''` = "아이콘 제거")을 따르므로 **당장의 라이브 데이터 손실은 발생하지 않는다**. 그러나 이 하드코딩은 세 가지 문제를 만든다.
1. **의미적 결합 오류**: 제목 저장 포트가 icon 도메인에 결합되어 "제목만 저장"이라는 단일 책임을 위반.
2. **잠재 데이터 손실 landmine**: 백엔드 null-skip 동작에 암묵 의존. 향후 `null = 아이콘 제거`로 계약이 바뀌거나 다른 PATCH 소비자가 생기면 제목을 칠 때마다(디바운스) 아이콘 소실.
3. **에디터 헤더 이모지 실배선 차단**: 헤더 아이콘 편집/표시를 하려면 이 save-port가 icon을 건드리지 않아야 함.

## 요구사항
### [Must]
- **M1**: `saveTitle`은 제목 저장 시 PATCH 본문에 `title`만 포함하고 `icon` 필드를 전송하지 않는다.
- **M2**: 기존 아이콘 값은 제목 저장 후에도 보존된다(회귀 방지).
- **M3**: 백엔드(`PageService`, `UpdatePageRequest`)는 변경하지 않는다. 수정 범위는 프론트엔드 훅과 그 테스트로 한정.

### [Should]
- **S1**: 버그를 인코딩한 기존 테스트(`usePageTitle.test.ts`의 `icon: null` 단언)를 올바른 계약(title-only)으로 교정.

### [Could]
- **C1**: 제목 저장 포트가 icon을 전송하지 않음을 문서화하는 주석을 남긴다(향후 회귀 방지).

## 수용 기준

### AC-1: saveTitle은 title만 포함하는 PATCH 본문을 전송한다
- **Given**: `usePageTitle('p-1', '')` 훅이 마운트되고, 초기 GET이 `{ id:'p-1', title:'기존제목', icon:'📄', workspaceId:'ws-1' }`으로 완료되어 workspaceId가 확보된 상태
- **When**: `saveTitle('새 제목')`을 호출한다
- **Then**: `apiPatch`가 `/api/workspaces/ws-1/pages/p-1` 경로로 1회 호출되고, 전송된 본문 객체는 `{ title: '새 제목' }`과 정확히 일치한다(`'icon' in body === false`)

### AC-2: 저장 본문에 icon 키가 없어 기존 아이콘이 백엔드에서 보존된다(회귀 방지)
- **Given**: `usePageTitle('p-1', '')` 훅이 마운트되고, 초기 GET이 `icon:'📌'`을 가진 페이지로 완료된 상태
- **When**: `saveTitle('제목만 변경')`을 호출한다
- **Then**: `apiPatch` 호출 인자의 본문에서 `Object.prototype.hasOwnProperty.call(body, 'icon') === false`이다(icon 키 자체가 없으므로 백엔드 부분 갱신 계약상 아이콘 미변경)

### AC-3: workspaceId 미확보 시(GET 미완료) 저장을 건너뛴다(기존 동작 보존)
- **Given**: `usePageTitle('p-1', '')` 훅이 마운트되었으나 초기 GET이 아직 완료되지 않아 workspaceId가 null인 상태
- **When**: `saveTitle('x')`을 호출한다
- **Then**: `apiPatch`가 호출되지 않는다(mock 호출 횟수 0)

## 제외 범위
- 백엔드 `PageService.updatePage` 부분 갱신 계약 변경.
- 사이드바 IconPicker 아이콘 설정/제거 기능 변경.
- 에디터 헤더 이모지 직접 편집 신규 기능(향후 별도 작업).
