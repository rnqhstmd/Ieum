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
      {/* 재연결 시 missing-op 복원이 아직 미구현이므로 "모든 변경사항 저장됨" 단정(거짓 안심)을 제거한다. */}
      <span className="text-ok">다시 연결됨</span>
    </div>
  );
}
