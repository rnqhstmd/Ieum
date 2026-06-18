'use client';

interface Props {
  onCreate: () => void;
}

export default function NewPageButton({ onCreate }: Props) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex items-center justify-center gap-2 rounded-full border border-hair px-4 py-2.5 text-xs font-semibold text-ink hover:bg-hover"
    >
      <span aria-hidden>＋</span> 새 페이지
    </button>
  );
}
