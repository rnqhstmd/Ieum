interface Props {
  name?: string;
  email?: string;
}

export default function AccountArea({ name = '내 계정', email }: Props) {
  return (
    <div className="mt-2.5 flex items-center gap-[9px] border-t border-hair-3 px-2 pb-1 pt-[11px]">
      <span
        aria-hidden
        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#a99bff] text-[12px] font-bold text-black"
      >
        {[...name][0] ?? ''}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        {email && <div className="truncate text-[11px] text-faint">{email}</div>}
      </div>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 flex-none text-faint"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
