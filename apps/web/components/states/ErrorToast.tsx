'use client';

import { useState } from 'react';

interface ErrorToastProps {
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorToast({
  message = '변경사항을 저장하지 못했습니다.',
  onRetry,
  onDismiss,
}: ErrorToastProps) {
  // 보안 MEDIUM #1: "다시 시도"는 1회만 반응하도록 로컬 상태로 잠금
  const [retried, setRetried] = useState(false);

  return (
    <div
      role="alert"
      className="flex w-[320px] items-center gap-3 rounded-[12px] border border-hair bg-deep px-4 py-3.5"
    >
      <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-danger" />
      <span className="flex-1 text-[13px] text-ink">{message}</span>
      {/* onRetry가 있을 때만 노출 — 재시도 대상이 없는 showError에는 버튼을 걸지 않는다. */}
      {onRetry && (
        <button
          type="button"
          onClick={() => {
            if (retried) return;
            setRetried(true);
            onRetry?.();
          }}
          disabled={retried}
          className="flex-none text-xs font-bold text-danger transition hover:opacity-80"
        >
          다시 시도
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        className="flex-none text-faint transition hover:text-body"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
