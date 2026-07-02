'use client';

// A3 ⌘K 팔레트 소유 컨테이너 — 열림/검색어/필터/방향키 네비/portal 소유(controlled).
// pages는 현재 워크스페이스 트리만 전달되므로 후보가 현재 ws로 자동 한정된다(BR-1/AC-17).
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CommandPalette from './CommandPalette';
import { flattenPageTree } from '@/src/lib/pages';
import { buildCommandCandidates, assembleGroups, type PaletteItem } from '@/src/lib/palette/groups';
import type { Page, Workspace, Membership } from '@/src/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  pages: Page[];
  onNavigate: (pageId: string) => void;
  // 사이드바 트리 조회 진행 여부 — true면 안내 문구를 "불러오는 중…"으로 노출한다(optional).
  loading?: boolean;
  // 명령/사람 찾기 그룹 확장(A3) — 모두 optional. 미전달 시 기존 페이지-only 동작을 유지한다.
  workspace?: Workspace | null;
  members?: Membership[];
  onCreatePage?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onToggleTheme?: () => void;
  onOpenMembers?: () => void;
  onLogout?: () => void;
}

export default function CommandPaletteContainer({
  open,
  onClose,
  pages,
  onNavigate,
  loading = false,
  workspace,
  members,
  onCreatePage,
  onOpenSettings,
  onOpenHelp,
  onToggleTheme,
  onOpenMembers,
  onLogout,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // 페이지/사람/명령 세 그룹의 원시(비필터) 후보를 조립한다(FR-6). onSelect는 memo 밖 의존성인
  // onNavigate/onClose(Sidebar 인라인 콜백)를 참조하지만, 이 콜백들이 재계산 트리거는 아니다.
  const rawGroups = useMemo(() => {
    // 닫혀 있으면 평탄화/조립 자체를 건너뛴다 — 컨테이너는 사이드바에 상시 마운트되므로
    // 닫힌 상태에서 매 렌더마다 전체 트리를 평탄화하는 낭비를 막는다(+ 닫힘 시 pages 목업 의존 회피).
    if (!open) return [];
    const pageItems: PaletteItem[] = flattenPageTree(pages).map((p) => ({
      id: p.id,
      icon: p.icon ?? '📄',
      title: p.title || '제목 없음',
      search: (p.title || '').toLowerCase(),
      onSelect: () => {
        onNavigate(p.id);
        onClose();
      },
    }));

    const groups = [{ label: '페이지', items: pageItems }];

    // SHARED 워크스페이스일 때만 "사람 찾기" 그룹을 후보에 넣는다(AC-A13).
    if (workspace?.type === 'SHARED') {
      const personItems: PaletteItem[] = (members ?? []).map((m) => ({
        id: m.userId,
        icon: '👤',
        title: m.userName,
        meta: m.userEmail,
        search: (m.userName + ' ' + m.userEmail).toLowerCase(),
        onSelect: () => {
          onOpenMembers?.();
          onClose();
        },
      }));
      groups.push({ label: '사람 찾기', items: personItems });
    }

    const commandItems: PaletteItem[] = buildCommandCandidates(workspace ?? null, {
      onCreatePage,
      onOpenSettings,
      onOpenHelp,
      onToggleTheme,
      onOpenMembers,
      onLogout,
    }).map((c) => ({
      id: c.id,
      icon: c.icon,
      title: c.title,
      search: c.title.toLowerCase(),
      onSelect: () => {
        c.run();
        onClose();
      },
    }));
    groups.push({ label: '명령 실행', items: commandItems });

    return groups;
  }, [open, pages, workspace, members, onCreatePage, onOpenSettings, onOpenHelp, onToggleTheme, onOpenMembers, onLogout, onNavigate, onClose]);

  // loading이면 그룹을 비운 채로 조립해 명령 등 상시 존재 후보가 노출되는 것을 막는다.
  const { groups, flat } = useMemo(
    () => assembleGroups(loading ? [] : rawGroups, query),
    [loading, rawGroups, query],
  );

  // 리스트 안내 문구: 로딩 중 > 항목 0개(검색 무결과/페이지 없음) 순. 항목이 있으면 undefined(안내 미노출).
  const emptyMessage = loading
    ? '불러오는 중…'
    : flat.length === 0
      ? query
        ? '검색 결과가 없습니다'
        : '페이지가 없습니다'
      : undefined;

  // 검색어가 바뀌면 하이라이트를 첫 항목으로 되돌린다(FR-7).
  // useLayoutEffect: query 변경 렌더와 리셋 사이의 stale activeIndex 프레임을 제거한다.
  useLayoutEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 팔레트가 닫히면 검색어·하이라이트를 초기화한다 — 컨테이너가 상시 마운트라
  // 리셋하지 않으면 재열림 시 직전 검색어가 남는다(AC-6: 빈 검색어로 시작).
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // 보안 감사 MEDIUM #3: 사람 그룹이 지연 삽입(members 참조 변경)되면 flat 인덱스가 밀려
  // stale activeIndex가 엉뚱한 항목을 가리킬 수 있어 하이라이트를 첫 항목으로 되돌린다.
  useEffect(() => {
    setActiveIndex(0);
  }, [members]);

  // 방향키/Enter는 컨테이너 래퍼에서 처리한다. Escape(onClose)는 CommandPalette가 소유하므로 여기서 다루지 않아 충돌이 없다.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1)); // 하단 경계 클램프
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0)); // 상단 경계 클램프
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // noUncheckedIndexedAccess: 인덱스 접근 결과가 undefined일 수 있어 옵셔널 체이닝으로 가드한다.
      flat[activeIndex]?.onSelect();
    }
  };

  // open=false 초기 상태에서는 null을 반환하므로 SSR/하이드레이션에 안전하다(createPortal은 열렸을 때만 실행).
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      <CommandPalette
        onClose={onClose}
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        activeIndex={activeIndex}
        emptyMessage={emptyMessage}
      />
    </div>,
    document.body,
  );
}
