'use client';

// 파괴적/일반 액션 확인 모달 — 재사용형. onConfirm/onCancel 호출(쇼케이스에선 no-op).
import { useEffect, useId } from 'react';

interface Props {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] max-w-[calc(100%-32px)] rounded-[14px] border border-hair bg-deep p-7"
      >
        <h2 id={titleId} className="text-[19px] font-bold text-ink">
          {title}
        </h2>
        {message && <p className="mt-3 text-sm text-dim">{message}</p>}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-hair px-4 py-2 text-[13px] font-medium text-body hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full border px-4 py-2 text-[13px] font-medium hover:bg-hover ${
              destructive ? 'border-danger text-danger' : 'border-ink text-ink'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
