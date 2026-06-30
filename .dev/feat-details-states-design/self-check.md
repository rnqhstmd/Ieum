# 자기점검 결과 — Details(오버레이) + States(상태) 컴포넌트

## Critical: 0건 (자기점검 통과)

## Warning (반영)
- [반영] AccountMenu `role="menu"` 내부 name/email 헤더 div가 비-menuitem → `role="none"` 추가(WAI-ARIA 정합).

## Info (반영)
- [반영] CommandPalette: `item.kbd ?? '⏎'` → `{item.kbd && <kbd>}` 조건부(kbd 없는 항목엔 ⏎ 미표시).
- [반영] ErrorToast: `role="status"` → `role="alert"`(저장 실패는 assertive 알림이 적합, 명세 허용).

## QUESTION → 판단(현 설계 유지)
- AccountMenu name/email 헤더: 유지(prop 활용 + role=none 보강) — 권장안 a.
- ContextMenu/AccountMenu Escape: 소비자가 열기/닫기 상태를 소유하므로 Escape는 소비자 위임 — 현 설계 유지(관심사 분리).

## AC 충족 (qa-manager 대조)
- 13개 컴포넌트 디자인 구조·px·색·문구 명세 1:1 (오버레이 5 + 상태 6 + 쇼케이스 2) ✓
- 재사용성·데이터 원칙: 컴포넌트 내부 가짜 이름/팀명 없음, 샘플은 쇼케이스 prop 주입 ✓
- 토큰: fainter/fill-a/fill-b 추가, 임의값 색 우회 없음 ✓
- 접근성: dialog/aria-modal+Escape(모달/시트), menu/menuitem(메뉴), alert/status(토스트·배너), 장식 aria-hidden, 파괴적 text-danger ✓
- 스텁 경계: 실제 백엔드 호출 없음 ✓
- 스킵: 워크스페이스 스위처 드롭다운(#35)·슬래시 메뉴(editor-ux) 미구현 명시 ✓

## 검증
- type-check: clean
- next build: 통과(/showcase/overlays 3.64kB·/showcase/states 2.65kB, 8 static)
- 육안: 쇼케이스 라우트로 13개 컴포넌트 확인 가능
