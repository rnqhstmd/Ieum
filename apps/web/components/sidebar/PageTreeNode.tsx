'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { Page } from '@/src/lib/types';
import ContextMenu from '@/components/states/ContextMenu';
import IconPicker from '@/components/overlays/IconPicker';

interface Props {
  page: Page;
  depth: number;
  onNavigate: (id: string) => void;
  onCreateChild?: (parentId: string) => void;
  onRename?: (id: string, title: string) => void;
  onSetIcon?: (id: string, icon: string) => void;
  onArchive?: (id: string) => void;
}

/** 랜덤 아이콘용 기본 이모지 셋 (IconPicker 그리드와 동일 계열) */
const RANDOM_EMOJIS = [
  '📄', '📝', '📌', '📁', '⭐', '🔥', '💡', '✅',
  '🎯', '🚀', '📊', '📈', '🔖', '🧩', '🎨', '📅',
  '🔔', '💬', '🧠', '🌱', '⚡', '🌟', '🎉', '📦',
];

export default function PageTreeNode({
  page,
  depth,
  onNavigate,
  onCreateChild,
  onRename,
  onSetIcon,
  onArchive,
}: Props) {
  const hasChildren = !!page.children && page.children.length > 0;
  const pathname = usePathname();
  const active = pathname === `/page/${page.id}`;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<'none' | 'title' | 'icon'>('none');
  // 우클릭 컨텍스트 메뉴 위치(커서 좌표). null이면 닫힘.
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  // Enter/Escape 처리 후 언마운트로 인해 onBlur가 한 번 더 트리거되어도
  // 커밋이 중복/취소무시되지 않도록 가드한다(실브라우저 blur-on-unmount 대응).
  const finalizedRef = useRef(false);
  const iconRootRef = useRef<HTMLDivElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  const startEdit = (mode: 'title' | 'icon') => {
    finalizedRef.current = false;
    setEditing(mode);
  };

  /** commit=true면 변경 적용, false면 취소. 중복 호출(Enter→blur 등)은 1회만 처리. */
  const finishTitle = (value: string, commit: boolean) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (commit) {
      const trimmed = value.trim();
      if (trimmed && trimmed !== page.title) onRename?.(page.id, trimmed);
    }
    setEditing('none');
  };

  const closeIcon = () => setEditing('none');

  /** IconPicker onSelect → 아이콘 설정 + 닫기 */
  const selectIcon = (emoji: string) => {
    onSetIcon?.(page.id, emoji);
    closeIcon();
  };

  /** IconPicker onRemove → 아이콘 제거(빈값) + 닫기 */
  const removeIcon = () => {
    onSetIcon?.(page.id, '');
    closeIcon();
  };

  /** IconPicker onRandom → 기본 이모지 셋에서 랜덤 선택 후 onSelect 동일 처리 */
  const randomIcon = () => {
    const emoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)] ?? '📄';
    selectIcon(emoji);
  };

  /** 우클릭 → 커서 위치에 컨텍스트 메뉴 오픈(편집/아이콘 팝오버는 닫는다). */
  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setEditing('none');
    setMenu({ top: e.clientY, left: e.clientX });
  };

  // ── 아이콘 팝오버 외부 클릭 닫기 ──
  useEffect(() => {
    if (editing !== 'icon') return;
    const onPointerDown = (e: MouseEvent) => {
      if (iconRootRef.current && !iconRootRef.current.contains(e.target as Node)) closeIcon();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [editing]);

  // ── 컨텍스트 메뉴 외부 클릭 / Escape 닫기 ──
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  // 우클릭 메뉴 항목 — 기존 핸들러 재사용. 제공된 핸들러만 노출.
  const menuItems: { icon?: ReactNode; label: string; destructive?: boolean; onClick?: () => void }[] = [];
  if (onRename) menuItems.push({ icon: <span aria-hidden>✎</span>, label: '이름 변경', onClick: () => startEdit('title') });
  if (onSetIcon) menuItems.push({ icon: <span aria-hidden>☺</span>, label: '아이콘 변경', onClick: () => startEdit('icon') });
  if (onCreateChild) menuItems.push({ icon: <span aria-hidden>＋</span>, label: '하위 페이지 추가', onClick: () => onCreateChild(page.id) });
  if (onArchive) menuItems.push({ icon: <span aria-hidden>🗑</span>, label: '아카이브', destructive: true, onClick: () => onArchive(page.id) });

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-current={active ? 'page' : undefined}
        onContextMenu={menuItems.length ? openMenu : undefined}
        className={`group flex items-center gap-[7px] rounded-lg px-2.5 py-[7px] text-[13.5px] ${
          active ? 'bg-hover text-ink' : 'text-body hover:bg-hover'
        }`}
        style={{ marginLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '접기' : '펼치기'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex h-3 w-3 flex-none items-center justify-center text-faint hover:text-ink"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
            >
              <path d={expanded ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
            </svg>
          </button>
        ) : (
          <span className="inline-block w-3 flex-none" aria-hidden />
        )}

        {/* 아이콘 — onSetIcon 제공 시 클릭하여 IconPicker 팝오버로 편집 */}
        {onSetIcon ? (
          <div ref={iconRootRef} className="relative flex-none">
            <button
              type="button"
              aria-label={`${page.title} 아이콘 변경`}
              aria-expanded={editing === 'icon'}
              onClick={() => (editing === 'icon' ? closeIcon() : startEdit('icon'))}
              className="text-[14px]"
            >
              <span aria-hidden>{page.icon || '📄'}</span>
            </button>
            {editing === 'icon' && (
              <div className="absolute left-0 top-full z-50 mt-1">
                <IconPicker
                  selected={page.icon || undefined}
                  onSelect={selectIcon}
                  onRemove={removeIcon}
                  onRandom={randomIcon}
                />
              </div>
            )}
          </div>
        ) : (
          <span aria-hidden className="flex-none text-[14px]">
            {page.icon ?? '📄'}
          </span>
        )}

        {/* 제목 — 편집 모드 시 인라인 입력 */}
        {editing === 'title' ? (
          <input
            aria-label="페이지 이름"
            defaultValue={page.title}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishTitle(e.currentTarget.value, true);
              else if (e.key === 'Escape') finishTitle('', false);
            }}
            onBlur={(e) => finishTitle(e.currentTarget.value, true)}
            className="min-w-0 flex-1 rounded bg-hover px-1 text-[13.5px] text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigate(page.id)}
            className="min-w-0 flex-1 truncate text-left"
          >
            {page.title}
          </button>
        )}

        {/* 행 액션 (hover 시 노출) — 편집 중에는 숨겨 오작동 방지 */}
        {editing === 'none' && (
          <div className="flex flex-none items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
            {onRename && (
              <button
                type="button"
                aria-label={`${page.title} 이름 변경`}
                onClick={() => startEdit('title')}
                className="text-faint hover:text-ink"
              >
                <span aria-hidden>✎</span>
              </button>
            )}
            {onArchive && (
              <button
                type="button"
                aria-label={`${page.title} 아카이브`}
                onClick={() => onArchive(page.id)}
                className="text-faint hover:text-danger"
              >
                <span aria-hidden>🗑</span>
              </button>
            )}
            {onCreateChild && (
              <button
                type="button"
                aria-label={`${page.title} 하위 추가`}
                onClick={() => onCreateChild(page.id)}
                className="text-faint hover:text-ink"
              >
                <span aria-hidden>＋</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 우클릭 컨텍스트 메뉴 — 커서 고정 위치, 외부클릭/Escape 닫기 */}
      {menu && (
        <div ref={menuRootRef}>
          <ContextMenu
            items={menuItems}
            onClose={() => setMenu(null)}
            style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 50 }}
          />
        </div>
      )}

      {hasChildren && expanded && (
        <ul role="group">
          {page.children?.map((child) => (
            <PageTreeNode
              key={child.id}
              page={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onSetIcon={onSetIcon}
              onArchive={onArchive}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
