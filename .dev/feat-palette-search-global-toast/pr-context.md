# PR Context — CommandPalette 확장 + ErrorToast 전역화

## 배경
- **기능 A**: ⌘K 커맨드 팔레트가 현재 "페이지" 그룹 한 개(현재 워크스페이스 트리 검색·이동)만 제공했다. 재사용 뷰(CommandPalette)는 이미 다중 그룹·전역 하이라이트·emptyMessage를 지원하나, 실제 명령 실행이나 멤버 검색 기능이 없었다. 설정/도움말/테마/로그아웃은 계정 메뉴에서만, 멤버 관리 진입은 사이드바 버튼(공유 ws 전용)으로만 가능했다.
- **기능 B**: 전역 토스트 인프라(ToastProvider/useToast)는 이미 (app) 레이아웃 전체를 감쌌으나 사용처가 에디터 제목 저장 한 곳뿐이었다. MembersModal 변경 액션 실패 시 블로킹 `alert()`가 뜨고, Sidebar는 페이지 생성/이름변경/아이콘/아카이브 실패 시(401 제외) 초기 트리 조회 실패와 같은 경로를 타서 **이미 불러온 트리 전체가 오류 화면으로 사라지는** 문제가 있었다.

## 요구사항 (핵심)
- 팔레트에 "명령 실행"(6종, 컨텍스트 조건부)·"사람 찾기"(SHARED 멤버 이름/이메일 검색) 그룹 추가. 세 그룹 동시 필터·빈 그룹 숨김·그룹 경계 넘는 방향키/Enter·재열림 초기화·로딩 게이팅. 사람 조회 401→로그인, 비401→사람 그룹만 숨김.
- ErrorToast 전역화: MembersModal `alert()`→`showError`, Sidebar mutation 실패는 트리 유지 + 전역 토스트(액션별 고정 문구) + 재시도. 초기/트리 로드 실패는 기존 인라인 오류 유지.

## Audit Summary
- 총 6건 (CRITICAL: 0, HIGH: 0, MEDIUM: 5 · Quality Critical 0 / Important 0(해소))
- Spec: PASS (Must 34/34, Should 1/1, 설계 이탈 없음)
- 인가는 백엔드 AccessGuard 위임 확인(UI 게이팅 오인 없음), XSS 없음, 토스트 문구에 PII/에러원문 없음, PERSONAL 이메일 미노출
- 리뷰 중 수정: 재시도 중복 방지(ErrorToast 1회 제한), 사람 그룹 지연 삽입 activeIndex 리셋, 토스트 교체 시 재시도 잠금 초기화(ToastProvider key), onCreatePage 참조 안정화
- 잔여 기록(후속, 비차단): 재시도 position stale(M2), 401 후 navigate 경쟁(M4, /page 재검증 의존), 정보성(M5), 품질 Minor(god-component·DRY-lite)

## 검증
- typecheck clean · vitest 362 pass / 0 fail · next build 성공 (verify 게이트 통과)
