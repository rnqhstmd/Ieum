# 이음 (Ieum) 프로젝트 컨텍스트

도메인 지식·아키텍처·용어 사전을 정리하는 공간입니다. 이 폴더는 도메인 지식의 원본(SSOT)이며, 상세 기획·설계는 [`../requirements/`](../requirements/README.md)에서 이어집니다.

## 도메인

| 도메인 | 설명 | 상세 |
|--------|------|------|
| **auth** | Google OAuth 인증·세션·권한 모델·권한 검사 | [auth/](auth/README.md) |
| **workspace** | 개인/공유 워크스페이스·멤버십·초대·역할 관리 | [workspace/](workspace/README.md) |
| **page** | 페이지 트리(중첩/정렬/아카이브)·블록 에디터 | [page/](page/README.md) |
| **collaboration** | 실시간 공동편집(자체 RGA CRDT)·presence | [collaboration/](collaboration/README.md) |

각 도메인 폴더는 `README.md`(배경·성공기준·담당), `PROJECTS.md`(관련 레포), `glossary.md`(용어), `architecture.md`(구조), `status.md`(구현 추적)로 구성됩니다.

## 공통

- [공통 용어 사전](glossary.md)

## 관련 기획 문서

- [requirements/](../requirements/README.md) — 제품 개요·PRD·MVP 로드맵·아키텍처·데이터 모델·API·CRDT·인증/권한·TDD·차별화
