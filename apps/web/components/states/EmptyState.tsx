'use client';

interface EmptyStateProps {
  title?: string;
  description?: string;
  ctaLabel?: string;
  onCreate?: () => void;
}

export default function EmptyState({
  title = '첫 페이지를 만들어 보세요',
  description = '문서, 위키, 회의록 — 무엇이든 빈 페이지에서 시작합니다.',
  ctaLabel = '첫 페이지 만들기',
  onCreate,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        aria-hidden
        className="flex h-[58px] w-[58px] items-center justify-center rounded-[14px] border border-dashed border-hair text-fainter"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <h2 className="mt-5 text-[22px] font-bold text-ink">{title}</h2>
      <p className="mt-2 max-w-[320px] text-sm text-dim">{description}</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-ink px-5 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-hover"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {ctaLabel}
      </button>
    </div>
  );
}
