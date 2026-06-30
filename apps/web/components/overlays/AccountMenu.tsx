'use client';

// 계정 메뉴 패널 — prop 주도 재사용형. 트리거(계정 행)는 AccountArea가 별도, 여기선 메뉴 패널만.

interface Props {
  name?: string;
  email?: string;
  theme?: '다크' | '라이트';
  onSettings?: () => void;
  onToggleTheme?: () => void;
  onHelp?: () => void;
  onLogout?: () => void;
}

const rowClass = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-hover';

export default function AccountMenu({
  name,
  email,
  theme = '다크',
  onSettings,
  onToggleTheme,
  onHelp,
  onLogout,
}: Props) {
  return (
    <div role="menu" aria-label="계정 메뉴" className="w-[332px] rounded-[12px] border border-hair bg-deep p-1.5">
      {(name || email) && (
        <div role="none" className="border-b border-hair-3 px-3 pb-2.5 pt-1.5">
          {name && <div className="truncate text-[13px] font-semibold text-ink">{name}</div>}
          {email && <div className="truncate text-[11px] text-faint">{email}</div>}
        </div>
      )}

      <div className="pt-1">
        <button type="button" role="menuitem" onClick={onSettings} className={`${rowClass} text-body`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-faint">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span className="flex-1">설정</span>
        </button>

        <button type="button" role="menuitem" onClick={onToggleTheme} className={`${rowClass} text-body`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-faint">
            <path
              d="M13 9.2A5.2 5.2 0 0 1 6.8 3a5.2 5.2 0 1 0 6.2 6.2Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <span className="flex-1">테마</span>
          <span className="flex-none rounded-full border border-hair-2 px-2 py-0.5 text-[11px] text-faint">
            {theme}
          </span>
        </button>

        <button type="button" role="menuitem" onClick={onHelp} className={`${rowClass} text-body`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-faint">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M6.3 6.2a1.8 1.8 0 1 1 2.3 1.8c-.5.2-.8.6-.8 1.1v.3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
          </svg>
          <span className="flex-1">도움말</span>
        </button>

        <div className="my-1 border-t border-hair-3" />

        <button type="button" role="menuitem" onClick={onLogout} className={`${rowClass} text-danger`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none">
            <path
              d="M6.2 2.5H3.6A1.5 1.5 0 0 0 2.1 4v8a1.5 1.5 0 0 0 1.5 1.5h2.6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 11l3-3-3-3M13 8H6.2"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="flex-1">로그아웃</span>
        </button>
      </div>
    </div>
  );
}
