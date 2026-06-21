'use client';

// ─── P6 라이브 커서 상태 훅 ───────────────────────────────────────
// 협업자 커서(clientId → blockId·anchorId)를 CRDT DocState·presence와 분리해 관리한다.
// 색·이름은 미보유 — 렌더 시 PresenceInfo에서 lookup(단일 출처). 상태 전이는 순수 reducer.

import { useCallback, useMemo, useState } from 'react';
import type { CursorInfo } from './protocol';

export type CursorMap = Map<string, CursorInfo>;

/** 커서 추가/갱신 — 입력 맵 불변(immutable). */
export function applyCursorUpdate(map: CursorMap, info: CursorInfo): CursorMap {
  const next = new Map(map);
  next.set(info.clientId, info);
  return next;
}

/** 커서 제거 — 입력 맵 불변. presence-leave와 연동(BR-7). */
export function applyCursorLeave(map: CursorMap, clientId: string): CursorMap {
  if (!map.has(clientId)) return map;
  const next = new Map(map);
  next.delete(clientId);
  return next;
}

export interface UseCursorResult {
  /** clientId 오름차순 정렬된 커서 목록 — 렌더 안정성. */
  cursors: CursorInfo[];
  onCursorUpdate(info: CursorInfo): void;
  onCursorLeave(clientId: string): void;
}

export function useCursor(): UseCursorResult {
  const [map, setMap] = useState<CursorMap>(() => new Map());

  const onCursorUpdate = useCallback((info: CursorInfo) => {
    setMap((m) => applyCursorUpdate(m, info));
  }, []);
  const onCursorLeave = useCallback((clientId: string) => {
    setMap((m) => applyCursorLeave(m, clientId));
  }, []);

  const cursors = useMemo(
    () => [...map.values()].sort((a, b) => a.clientId.localeCompare(b.clientId)),
    [map],
  );

  return { cursors, onCursorUpdate, onCursorLeave };
}
