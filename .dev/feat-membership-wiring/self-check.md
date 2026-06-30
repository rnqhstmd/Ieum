# 자기점검 결과 — 멤버십·초대 라이브 배선 (슬라이스 1)

## Critical: 0건 (자기점검 통과)

## Warning (반영)
- [반영] handleInvite 이중 제출 가드 → `inviting` 상태 + InviteRow `disabled` 전달(중복 초대/이메일 방지).
- [반영] invite-content handleAccept 401 미처리 → 401→`/login` 유도 추가(/invite 공개 라우트라 미인증 수락 시 401 발생 확인 — middleware 없음).
- [반영] mutation+reload 단일 try/catch → **분리**. mutation 실패만 에러 표시, 성공 후 reload 실패는 무시(액션 완료됨 → 중복/오해 방지). 4개 핸들러 적용.

## Info (반영)
- [반영] InviteRow stale JSDoc("스텁") → 배선 반영해 갱신.
- [추가 방어] handleChangeRole/handleRemove에 `member.userId === me.id` 가드(본인 역할변경·내보내기 차단). MemberRow가 `showMenu = canManage && !isSelf`로 UI는 이미 숨기지만 방어심층화.

## QUESTION (해소)
1. /invite 공개 라우트? → **middleware 없음 = 공개**. 401 발생 가능 → Warning2 수정 적용.
2. MemberRow가 isSelf 시 버튼 숨김? → **`showMenu = canManage && !isSelf`로 숨김 확인**. 추가 방어가드만 적용.

## AC 충족 (qa-manager 대조)
- API 계약 정합: acceptInvitation(POST accept {token}) + 4종 변경액션 엔드포인트/페이로드/에러코드 백엔드 일치 ✓
- 초대 수락 에러→상태 매핑(410 expired/409 already/404·403·기타 invalid, 401→login) + 성공 /dashboard ✓
- mutation 후 reload 반영, 중복/경쟁 가드 ✓
- 파괴적 액션 confirm + 권한(canManage=OWNER) 가드 + 본인 방어 ✓
- 401→/login, 변경 실패 피드백 ✓
- 회귀 0(229 통과), 모달/카드 role·aria 유지, 사이드바 SHARED-only 트리거 ✓

## 검증
- type-check clean / vitest 229 통과 / next build 통과(invite·members 라우트)
