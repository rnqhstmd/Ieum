interface Props {
  name?: string;
  email?: string;
}

export default function AccountArea({ name = '내 계정', email }: Props) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5 border-t border-hair-3 px-2 pb-1 pt-2.5">
      <span
        aria-hidden
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#a99bff] text-[12px] font-bold text-black"
      >
        {name.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        {email && <div className="truncate text-[11px] text-faint">{email}</div>}
      </div>
    </div>
  );
}
