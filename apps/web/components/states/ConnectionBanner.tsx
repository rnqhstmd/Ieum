interface ConnectionBannerProps {
  status: 'offline' | 'reconnected';
}

export default function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'offline') {
    return (
      <div
        role="status"
        className="flex w-full items-center gap-2.5 border-b border-hair bg-deep px-4 py-2.5 text-[13px]"
      >
        <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-warn" />
        <span className="text-warn">오프라인 — 변경사항을 저장하지 못했습니다.</span>
        <span className="ml-auto text-dim underline">재연결 중…</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="inline-flex items-center gap-2.5 rounded-[10px] border border-hair-2 bg-deep px-4 py-2.5 text-[13px]"
    >
      <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-ok" />
      <span className="text-ok">다시 연결됨 · 모든 변경사항 저장됨</span>
    </div>
  );
}
