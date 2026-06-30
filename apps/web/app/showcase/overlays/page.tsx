'use client';

// Details(오버레이) 쇼케이스 — 각 오버레이를 라벨 붙은 relative 프레임에 "열린 상태"로 렌더.
// 백드롭은 프레임 내 absolute로 스코프. 샘플 prop 주입, 콜백 no-op.
import type { ReactNode } from 'react';

import AccountMenu from '@/components/overlays/AccountMenu';
import CommandPalette from '@/components/overlays/CommandPalette';
import ConfirmDialog from '@/components/overlays/ConfirmDialog';
import IconPicker from '@/components/overlays/IconPicker';
import MobileActionSheet from '@/components/overlays/MobileActionSheet';

const noop = () => {};

function Frame({ label, height, children }: { label: string; height: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[1.6px] text-label">{label}</div>
      <div className={`relative overflow-hidden rounded-xl border border-hair bg-surface ${height}`}>
        {children}
      </div>
    </section>
  );
}

export default function OverlaysShowcasePage() {
  return (
    <main className="min-h-screen bg-deep px-6 py-10 text-ink">
      <div className="mx-auto max-w-[920px]">
        <h1 className="text-2xl font-semibold">Details · 오버레이</h1>
        <p className="mt-2 text-sm text-dim">재사용 프레젠테이션 컴포넌트 갤러리. 모든 액션은 스텁(no-op).</p>

        <div className="mt-8 flex flex-col gap-8">
          <Frame label="Command Palette" height="h-[420px]">
            <CommandPalette
              onClose={noop}
              groups={[
                {
                  label: '빠른 이동',
                  items: [
                    { icon: '📄', title: '제품 로드맵', meta: '최근 편집', onSelect: noop },
                    { icon: '📝', title: '주간 회의록', meta: '어제', onSelect: noop },
                    { icon: '📁', title: '디자인 시스템', meta: '3일 전', onSelect: noop },
                  ],
                },
                {
                  label: '액션',
                  items: [
                    { icon: '＋', title: '새 페이지 만들기', kbd: '⏎', onSelect: noop },
                    { icon: '✉', title: '멤버 초대', kbd: '⏎', onSelect: noop },
                  ],
                },
              ]}
            />
          </Frame>

          <Frame label="Icon Picker" height="h-[360px]">
            <div className="flex h-full items-center justify-center">
              <IconPicker onSelect={noop} onRandom={noop} onRemove={noop} />
            </div>
          </Frame>

          <Frame label="Confirm Dialog (파괴적)" height="h-[300px]">
            <ConfirmDialog
              title="페이지를 아카이브할까요?"
              message="아카이브하면 사이드바에서 숨겨지며, 언제든 보관함에서 복원할 수 있습니다."
              confirmLabel="아카이브"
              cancelLabel="취소"
              destructive
              onConfirm={noop}
              onCancel={noop}
            />
          </Frame>

          <Frame label="Account Menu" height="h-[360px]">
            <div className="flex h-full items-start justify-center pt-8">
              <AccountMenu
                name="김이음"
                email="ieum@example.com"
                theme="다크"
                onSettings={noop}
                onToggleTheme={noop}
                onHelp={noop}
                onLogout={noop}
              />
            </div>
          </Frame>

          <Frame label="Mobile Action Sheet" height="h-[420px]">
            <MobileActionSheet
              title="주간 회의록"
              icon="📝"
              actions={[
                { icon: <span>✏️</span>, label: '이름 변경', onClick: noop },
                { icon: <span>🔗</span>, label: '링크 복사', onClick: noop },
                { icon: <span>📋</span>, label: '복제', onClick: noop },
                { icon: <span>🗑️</span>, label: '삭제', destructive: true, onClick: noop },
              ]}
              onClose={noop}
            />
          </Frame>
        </div>
      </div>
    </main>
  );
}
