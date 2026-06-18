# 이음(Ieum) — 디자인

## 디자인 SSOT: Claude Design

이 프로젝트의 UI 디자인 **원본(SSOT)** 은 Claude Design 프로젝트다. 모든 화면·토큰은 여기서 출발한다.

- 프로젝트명: **Design system for productivity app**
- projectId: `22dc8b3b-80b9-468c-94cf-8cfe5ff59b81`
- URL: https://claude.ai/design/p/22dc8b3b-80b9-468c-94cf-8cfe5ff59b81
- 무드: **SpaceX-inspired** — 검정/흰색 베이스, 대문자 디스플레이(D-DIN), 고스트 pill 버튼, 헤어라인(`#3a3a3f`) 구분선, 그림자 없는 평면
- 연동: Claude Design 커넥터(`DesignSync` 도구)로 읽기/동기화

## 화면 (`design/screens/` — Claude Design에서 임포트)

| 파일 | 화면 | 상태 |
|------|------|------|
| `IEUM Landing.dc.html` | 랜딩(비로그인 풀블리드 히어로) | P2 ✅ (PR #5) |
| `IEUM Login.dc.html` | 로그인(black canvas + 고스트 pill) | P2 ✅ (PR #5) |
| `IEUM App.dc.html` | 메인 앱(사이드바 + 에디터 + presence) | 사이드바 P2 ✅ (PR #5) / 에디터 P3 |
| `IEUM Details.dc.html` | 페이지 상세·블록 에디터 | P3 |
| `IEUM States.dc.html` | 빈/로딩/에러 상태 + 페이지 컨텍스트 메뉴 | P2 일부(빈/에러) |
| `IEUM Members.dc.html` | 공유 워크스페이스 멤버 관리 | P7 |
| `IEUM Invite.dc.html` | 초대 수락 | P7 |

## 토큰 / 가이드 문서

- `spacex-DESIGN.md` — 무드 + 색/타이포/간격/컴포넌트 토큰 (Claude Design `uploads/`에서 가져온 디자인 시스템 SSOT)
- `screen-prompts.md` — 화면별 생성 프롬프트 + "생산성 앱" 적응 규칙(작업 화면 다크 서피스·본문 sentence-case·presence 기능색)
- `design-prompt.txt` — UI 생성 프롬프트 원본

## 구현 매핑 (실제 코드 반영)

- 토큰 → `apps/web/app/globals.css`(CSS 변수 dark/light) + `apps/web/tailwind.config.ts`(colors·fontFamily)
- 다크 기본: `<html data-theme="dark">`, 작업 화면 `--c-surface #0a0a0a`/`--c-deep #000` + 헤어라인 `--c-hair #3a3a3f`
- 폰트: 디자인의 D-DIN 무드를 한글 친화 **Pretendard**로 적응(`screen-prompts.md` 적응 규칙 B)
- presence 기능색 5종: `#6fd6e8` `#e8c06f` `#79e0a0` `#a99bff` 등 (브랜드 액센트 아님, 사용자 구분용)
- 사이드바·랜딩·로그인·모바일 드로어 구현: PR #5

## 갱신 방법

Claude Design에서 화면이 변경되면 `DesignSync(method="get_file", projectId="22dc8b3b-80b9-468c-94cf-8cfe5ff59b81", path="...")`로 `design/screens/`를 다시 임포트한다. 임포트된 `.dc.html`은 렌더 참조용이며 앱 빌드에는 포함되지 않는다.
