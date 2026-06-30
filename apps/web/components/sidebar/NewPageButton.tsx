'use client';

interface Props {
  onCreate: () => void;
}

export default function NewPageButton({ onCreate }: Props) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex items-center justify-center gap-2 rounded-full border border-hair p-[11px] text-xs font-semibold text-ink hover:bg-hover"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      새 페이지
    </button>
  );
}
