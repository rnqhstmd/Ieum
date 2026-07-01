# PR 컨텍스트

## 비즈니스 맥락 (배경 / 요구사항)
이음(IEUM) 에디터의 제목 자동저장 훅 `usePageTitle`의 save-port `saveTitle`이 제목을 영속할 때 PATCH 본문에 `{ title, icon: null }`로 icon 필드를 하드코딩해 함께 전송했다. 이 훅은 제목(pages.title)만 책임지는데 범위 밖인 icon을 매 저장마다 전송한 것이다.

현재 백엔드 `PageService.updatePage`는 부분 갱신 계약(`icon: null` = "변경 안 함", `icon: ''` = "아이콘 제거")이라 당장의 라이브 데이터 손실은 없었으나, ① 제목 저장 포트가 icon 도메인에 결합된 단일책임 위반, ② 백엔드 null-skip에 암묵 의존하는 잠재 데이터 손실 landmine(향후 null=clear 계약 시 매 저장마다 아이콘 소실), ③ 에디터 헤더 이모지 실배선 차단 문제가 있었다.

요구사항: 제목 저장 포트는 `{ title }`만 전송(icon 미포함)한다. 아이콘 보존(회귀 방지). 백엔드 무변경(수정 범위는 프론트엔드 훅+테스트로 한정).

## Audit Summary
- 총 0건 (CRITICAL: 0, HIGH: 0)
- 인증/인가 불변(경로변수 기반 인가, body 축소 무관), 부분갱신 계약(icon 누락=보존) 검증, 타 필드 영향 없음
- hotfix 감사: CRITICAL 0건, HIGH 0건 (자세한 내용은 Trust Ledger 참조)
