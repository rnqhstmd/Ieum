'use client';

// 모바일 페이지 액션 시트 — prop 주도 재사용형. 백드롭은 부모(absolute inset-0) 기준 스코프.
import { useEffect, type ReactNode } from 'react';

interface SheetAction {
  icon?: ReactNode;
  label: string;
  destructive?: boolean;
  onClick?: () => void;
}

interface Props {
  title?: string;
  icon?: string;
  actions: SheetAction[];
  onClose?: () => void;
}

export default function MobileActionSheet({ title, icon, actions, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 flex items-end bg-black/55" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '페이지 액션'}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[18px] border-t border-hair bg-deep p-[12px_14px_20px]"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-fill-a" />

        {(title || icon) && (
          <div className="flex items-center gap-2 border-b border-hair-3 pb-3">
            {icon && (
              <span aria-hidden className="text-[17px]">
                {icon}
              </span>
            )}
            <span className="text-[15px] font-semibold text-ink">{title}</span>
          </div>
        )}

        <div className="flex flex-col py-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`flex items-center gap-3 rounded-lg px-2 py-3 text-left text-[15px] font-medium hover:bg-hover ${
                action.destructive ? 'text-danger' : 'text-body'
              }`}
            >
              {action.icon && (
                <span aria-hidden className="flex w-5 flex-none justify-center text-faint">
                  {action.icon}
                </span>
              )}
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-full border border-hair py-2.5 text-[14px] font-medium text-body hover:bg-hover"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
