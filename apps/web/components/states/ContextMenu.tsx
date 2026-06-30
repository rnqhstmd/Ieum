'use client';

import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface ContextMenuItem {
  icon?: ReactNode;
  label: string;
  destructive?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  onClose?: () => void;
  style?: CSSProperties;
}

export default function ContextMenu({ items, onClose, style }: ContextMenuProps) {
  return (
    <div
      role="menu"
      style={style}
      className="w-max min-w-[180px] rounded-[12px] border border-hair bg-deep p-1.5"
    >
      {items.map((item, i) => {
        const showDivider = Boolean(item.destructive) && i > 0 && !items[i - 1]?.destructive;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {showDivider && <div aria-hidden className="my-1.5 h-px bg-fill-b" />}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                item.onClick?.();
                onClose?.();
              }}
              className={`flex w-full items-center gap-2.5 rounded-[7px] px-3 py-[9px] text-left text-[13px] font-medium transition hover:bg-hover ${
                item.destructive ? 'text-danger' : 'text-body'
              }`}
            >
              {item.icon && (
                <span aria-hidden className={`flex-none ${item.destructive ? '' : 'text-faint'}`}>
                  {item.icon}
                </span>
              )}
              <span className="flex-1">{item.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
