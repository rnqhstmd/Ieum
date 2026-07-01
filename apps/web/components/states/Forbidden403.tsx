'use client';

interface Forbidden403Props {
  onRequestAccess?: () => void;
}

export default function Forbidden403({ onRequestAccess }: Forbidden403Props) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-[13px] font-bold uppercase tracking-[3px] text-fainter">403</div>
      <div
        aria-hidden
        className="mt-4 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-hair text-dim"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6.5 6.5l11 11" />
        </svg>
      </div>
      <h2 className="mt-4 text-[21px] font-bold text-ink">접근 권한이 없습니다</h2>
      <p className="mt-2 max-w-[320px] text-sm text-dim">
        이 페이지를 볼 수 있는 권한이 없습니다. 소유자에게 접근을 요청하세요.
      </p>
      <button
        type="button"
        onClick={onRequestAccess}
        className="mt-6 inline-flex items-center rounded-full border border-hair px-5 py-2.5 text-[13px] font-semibold text-body transition hover:bg-hover"
      >
        접근 요청
      </button>
    </div>
  );
}
