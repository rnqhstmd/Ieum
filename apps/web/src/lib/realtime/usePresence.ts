'use client';

// ─── P6 presence 상태 훅 (아바타 목록) ───────────────────────────
// awareness 상태(접속자 맵)를 CRDT DocState와 분리해 관리한다(관심사 분리, AC-9).
// 상태 전이를 순수 reducer로 추출하여 React 없이 단독 검증한다.

import { useCallback, useMemo, useState } from 'react';
import type { PresenceInfo } from './protocol';

export type PresenceMap = Map<string, PresenceInfo>;

/** 접속자 추가/갱신 — 입력 맵을 변형하지 않고 새 맵을 반환한다(immutable). */
export function applyPresenceUpdate(map: PresenceMap, info: PresenceInfo): PresenceMap {
  const next = new Map(map);
  next.set(info.clientId, info);
  return next;
}

/** 접속자 제거 — 입력 맵을 변형하지 않고 새 맵을 반환한다(immutable). */
export function applyPresenceLeave(map: PresenceMap, clientId: string): PresenceMap {
  if (!map.has(clientId)) return map;
  const next = new Map(map);
  next.delete(clientId);
  return next;
}

export interface UsePresenceResult {
  /** clientId 오름차순 정렬된 접속자 목록 — 렌더 안정성. */
  presences: PresenceInfo[];
  onPresenceUpdate(info: PresenceInfo): void;
  onPresenceLeave(clientId: string): void;
}

export function usePresence(): UsePresenceResult {
  const [map, setMap] = useState<PresenceMap>(() => new Map());

  const onPresenceUpdate = useCallback((info: PresenceInfo) => {
    setMap((m) => applyPresenceUpdate(m, info));
  }, []);
  const onPresenceLeave = useCallback((clientId: string) => {
    setMap((m) => applyPresenceLeave(m, clientId));
  }, []);

  const presences = useMemo(
    () => [...map.values()].sort((a, b) => a.clientId.localeCompare(b.clientId)),
    [map],
  );

  return { presences, onPresenceUpdate, onPresenceLeave };
}
