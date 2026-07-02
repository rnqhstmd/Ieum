'use client';

// A3 ⌘K 팔레트 소유 컨테이너 — 열림/검색어/필터/방향키 네비/portal 소유(controlled).
// pages는 현재 워크스페이스 트리만 전달되므로 후보가 현재 ws로 자동 한정된다(BR-1/AC-17).
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CommandPalette from './CommandPalette';
import { flattenPageTree } from '@/src/lib/pages';
import type { Page } from '@/src/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  pages: Page[];
  onNavigate: (pageId: string) => void;
  // 사이드바 트리 조회 진행 여부 — true면 안내 문구를 "불러오는 중…"으로 노출한다(optional).
  loading?: boolean;
}

export default function CommandPaletteContainer({
  open,
  onClose,
  pages,
  onNavigate,
  loading = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // 트리 평탄화 후 제목 부분일치(대소문자 무시)로 필터한 "순수 Page 데이터"만 메모한다(FR-6/AC-6).
  // onNavigate/onClose(Sidebar 인라인 콜백)를 의존성에서 제외해, Sidebar 리렌더로 콜백 참조가
  // 바뀌어도 전체 트리를 다시 평탄화하지 않는다(불필요 재계산 방지).
  const filtered = useMemo(() => {
    // 닫혀 있으면 평탄화/필터 자체를 건너뛴다 — 컨테이너는 사이드바에 상시 마운트되므로
    // 닫힌 상태에서 매 렌더마다 전체 트리를 평탄화하는 낭비를 막는다.
    if (!open) return [];
    const q = query.toLowerCase();
    return flattenPageTree(pages).filter((p) => p.title.toLowerCase().includes(q));
  }, [open, pages, query]);

  // onSelect 핸들러 생성은 memo 밖(렌더 시 map)에서 수행한다 — 콜백을 memo 의존성에서 분리하기 위함.
  const items = filtered.map((page) => ({
    id: page.id,
    icon: page.icon ?? '📄',
    title: page.title || '제목 없음',
    onSelect: () => {
      onNavigate(page.id);
      onClose();
    },
  }));

  // 리스트 안내 문구: 로딩 중 > 항목 0개(검색 무결과/페이지 없음) 순. 항목이 있으면 undefined(안내 미노출).
  const emptyMessage = loading
    ? '불러오는 중…'
    : items.length === 0
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

  // 방향키/Enter는 컨테이너 래퍼에서 처리한다. Escape(onClose)는 CommandPalette가 소유하므로 여기서 다루지 않아 충돌이 없다.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1)); // 하단 경계 클램프
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0)); // 상단 경계 클램프
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // noUncheckedIndexedAccess: 인덱스 접근 결과가 undefined일 수 있어 옵셔널 체이닝으로 가드한다.
      items[activeIndex]?.onSelect();
    }
  };

  // open=false 초기 상태에서는 null을 반환하므로 SSR/하이드레이션에 안전하다(createPortal은 열렸을 때만 실행).
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      <CommandPalette
        onClose={onClose}
        groups={[{ label: '페이지', items }]}
        query={query}
        onQueryChange={setQuery}
        activeIndex={activeIndex}
        emptyMessage={emptyMessage}
      />
    </div>,
    document.body,
  );
}
