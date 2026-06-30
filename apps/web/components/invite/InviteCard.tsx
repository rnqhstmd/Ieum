// 초대 수락 카드 (presentational) — IEUM 디자인 변형 A
// 상태 4종(valid/expired/already/invalid)을 검정 캔버스 중앙 카드로 렌더한다.
// 데이터 원칙: 토큰 미리보기 GET이 없어 워크스페이스명·초대자·역할을 알 수 없으므로
// VALID는 제네릭 카피(가짜 팀명/초대자 금지)를 사용한다.

export type InviteState = 'valid' | 'expired' | 'already' | 'invalid';

interface Props {
  state: InviteState;
  /** 수락 핸들러(스텁). VALID에서만 사용. */
  onAccept?: () => void;
  /** 거절 핸들러(스텁). VALID에서만 사용. */
  onReject?: () => void;
}

// 공통 클래스 — 모바일 풀폭, 데스크탑(sm:) inline pill.
const PILL_PRIMARY =
  'mt-[34px] flex w-full items-center justify-center rounded-full border border-ink px-9 py-4 text-[14px] font-bold text-ink transition hover:bg-hover sm:inline-flex sm:w-auto';
const PILL_SECONDARY =
  'mt-[34px] flex w-full items-center justify-center rounded-full border border-hair px-8 py-4 text-[14px] font-bold text-body transition hover:bg-hover sm:inline-flex sm:w-auto';

const ICON_WRAP =
  'mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-full sm:h-16 sm:w-16';
const HEADING = 'mt-[26px] text-[23px] font-bold tracking-[-0.5px] text-ink sm:text-[26px]';
const PARAGRAPH = 'mt-[16px] text-[15px] leading-[1.65] text-dim';

export default function InviteCard({ state, onAccept, onReject }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-deep px-7 text-center">
      <div className="w-full max-w-[380px]">
        {state === 'valid' && (
          <>
            {/* 워크스페이스명 미상 → 가짜 이니셜 대신 중립 accent 마크(IEUM 브랜드 글리프) */}
            <div
              aria-hidden
              className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-[15px] bg-accent text-[22px] font-extrabold text-black sm:h-16 sm:w-16 sm:rounded-[16px]"
            >
              I
            </div>
            <h1 className={HEADING}>워크스페이스에 초대되었습니다</h1>
            {/* 초대자 줄: 데이터 없음 → 생략(가짜 이름 금지) */}
            <button type="button" onClick={onAccept} className={PILL_PRIMARY}>
              수락하고 참여
            </button>
            <div>
              <button
                type="button"
                onClick={onReject}
                className="mt-[22px] text-[13px] font-medium text-faint underline underline-offset-[3px]"
              >
                초대 거절
              </button>
            </div>
          </>
        )}

        {state === 'expired' && (
          <>
            <div className={`${ICON_WRAP} border border-hair text-danger`}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3.5 2" />
              </svg>
            </div>
            <h1 className={HEADING}>초대가 만료되었습니다</h1>
            <p className={PARAGRAPH}>
              이 초대 링크는 7일이 지나 만료되었습니다. 관리자에게 새 초대를 요청하세요.
            </p>
            {/* 관리자 요청: 스텁(동작 없음). 후속 배선 시 mailto 또는 요청 API. */}
            <button type="button" aria-disabled className={PILL_SECONDARY}>
              관리자에게 요청
            </button>
          </>
        )}

        {state === 'already' && (
          <>
            <div className={`${ICON_WRAP} border border-ok text-ok`}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className={HEADING}>이미 멤버입니다</h1>
            <p className={PARAGRAPH}>
              회원님은 이미 이 워크스페이스의 멤버입니다. 바로 이동할 수 있습니다.
            </p>
            {/* 실제 이동 링크 */}
            <a href="/dashboard" className={PILL_PRIMARY}>
              워크스페이스 열기
            </a>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div className={`${ICON_WRAP} border border-hair text-danger`}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </div>
            <h1 className={HEADING}>유효하지 않은 초대</h1>
            <p className={PARAGRAPH}>
              이 링크가 올바르지 않거나 이미 취소되었습니다. 링크를 다시 확인해 주세요.
            </p>
            {/* 실제 이동 링크 */}
            <a href="/" className={PILL_SECONDARY}>
              홈으로 가기
            </a>
          </>
        )}
      </div>
    </main>
  );
}
