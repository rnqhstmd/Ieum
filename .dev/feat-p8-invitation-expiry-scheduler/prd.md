# PRD: P8 후속② — 초대 만료 스케줄러 (INV-04)

## 배경
초대 수락(acceptInvitation) 시점에 lazy 만료 검사가 존재한다(PENDING + expiresAt < now → EXPIRED + 410). 그러나 수락 시도 없이 방치된 초대는 DB에 PENDING으로 잔류하여, 초대 목록(listInvitations)에 만료된 초대가 PENDING으로 표시되는 정합성 문제가 있다. 일 1회 스케줄러로 PENDING 만료 초대를 EXPIRED로 일괄 전이하여 보완한다.

현황:
- acceptInvitation: lazy 만료(PENDING + expiresAt.isBefore(now) → EXPIRED + 410) 존재
- InvitationRepository: 만료 대상 일괄 조회/갱신 쿼리 없음
- IeumBackendApplication: `@EnableScheduling` 없음 (프로젝트 최초 스케줄러)
- InvitationStatus: PENDING/ACCEPTED/REVOKED/EXPIRED

## 목표
- 방치된 만료 초대를 일 1회 EXPIRED로 전이해 목록 상태를 실제와 일치시킨다.
- lazy 만료와 eager 스케줄러가 공존하며 실행 순서 무관하게 결과가 동일하다.

## 요구사항

### 기능 요구사항
- [Must] FR-1: `InvitationService.expirePendingInvitations()` 추가. `status=PENDING` AND `expiresAt < 실행 시각`인 초대 전부를 EXPIRED 전이하고 전이 건수(int)를 반환한다.
- [Must] FR-2: `@EnableScheduling` 활성화 + `@Scheduled` 트리거가 `expirePendingInvitations()`를 호출하는 얇은 스케줄러 컴포넌트 추가(반환값 미사용).
- [Must] FR-3: 실행 시작 + 전이 건수 N건을 INFO 로그로 기록.
- [Should] FR-4: cron을 외부 설정(application.yml / @Value)으로 분리. **기본값: 매일 새벽 2시 `0 0 2 * * *`** (사용자 확정).

### 비즈니스 규칙
- [Must] BR-1: 전이 대상은 `status=PENDING` AND `expiresAt < now`만. ACCEPTED/REVOKED/EXPIRED 불변.
- [Must] BR-2: `expiresAt == now`(경계값)는 비대상. `expiresAt < now`(strictly less)만 만료.
- [Must] BR-3: 멱등 — 동일 시각 기준 두 번 실행 시 두 번째는 0건, 데이터 손상 없음.
- [Must] BR-4: 스케줄러와 lazy 만료가 동일 초대를 처리해도 최종 EXPIRED, 충돌 없음.
- [Should] BR-5: 전이 0건도 정상 종료(예외 없음) + 로그.

### 품질 기대
- [Should] QE-1: `expirePendingInvitations()` 단위 테스트는 타이밍 비의존(고정 시각 기준 데이터 준비)으로 결정론적.

## 수용 기준

AC-1 → [FR-1, BR-1]
  Given: DB에 (PENDING, expiresAt=now-1일) 2건, (PENDING, expiresAt=now+1일) 1건, ACCEPTED 1건, REVOKED 1건, EXPIRED 1건 존재
  When: `expirePendingInvitations()` 호출
  Then: PENDING+만료 2건만 EXPIRED 전이, 나머지 4건 status 불변, 반환값 2

AC-2 → [BR-2]
  Given: (PENDING, expiresAt=T) 초대 존재, 호출 시각 now=T (경계값)
  When: `expirePendingInvitations()` 호출
  Then: 해당 초대 status는 PENDING 유지, 반환값 0

AC-3 → [BR-3, BR-5]
  Given: 만료 대상 PENDING 0건
  When: `expirePendingInvitations()` 2회 연속 호출
  Then: 두 번 모두 예외 없이 정상 종료, 반환값 각각 0

AC-4 → [FR-1, BR-3]
  Given: (PENDING, expiresAt=now-1일) 3건 존재
  When: `expirePendingInvitations()` 2회 연속 호출
  Then: 첫 호출 반환값 3, 두 번째 반환값 0, DB status 모두 EXPIRED 그대로

AC-5 → [BR-1]
  Given: ACCEPTED·REVOKED·EXPIRED 각 1건, 모두 expiresAt 과거
  When: `expirePendingInvitations()` 호출
  Then: 세 초대 status 불변, 반환값 0

AC-6 → [FR-2, FR-3]
  Given: `@EnableScheduling` 활성 + 스케줄러 컴포넌트 등록
  When: 스케줄러 트리거 발동
  Then: `expirePendingInvitations()`가 호출되고, 실행 시작·전이 건수가 INFO 로그에 기록

## 제외 범위
- 만료 초대 재발송·재활성화
- 스케줄러 결과 API/관리자 UI 노출
- 분산 환경 중복 실행 방지(ShedLock 등) — 단일 인스턴스 전제
