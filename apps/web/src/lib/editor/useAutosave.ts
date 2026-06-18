// ─── P3 자동저장 훅 (US-EDIT-02, Q1=후보A) ──────────────────────────
// debounce 메커니즘 + 저장 상태만 담당한다. 실제 영속화는 save-port(주입된
// save 콜백) 뒤로 격리되어 P5(CrdtOp/Snapshot)에서 연결된다.

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';

export interface UseAutosaveResult<T> {
  status: SaveStatus;
  notifyChange: (data: T) => void;
}

export function useAutosave<T>(
  save: (data: T) => void | Promise<void>,
  delayMs = 500,
): UseAutosaveResult<T> {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T | null>(null);
  const isMounted = useRef(true);
  // save 콜백의 최신 참조를 유지(notifyChange 재생성 없이 최신 클로저 사용).
  const saveRef = useRef(save);
  saveRef.current = save;

  const notifyChange = useCallback(
    (data: T) => {
      latest.current = data;
      setStatus('dirty'); // 미저장 변경 발생 — debounce 만료 전까지 'dirty'
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!isMounted.current) return;
        setStatus('saving');
        void Promise.resolve(saveRef.current(latest.current as T))
          // 언마운트 후 비동기 완료 시 setStatus 호출을 막는다(누수/경고 방지).
          .then(() => {
            if (isMounted.current) setStatus('saved');
          })
          .catch(() => {
            if (isMounted.current) setStatus('idle'); // 실패 시 idle 복귀(에러 처리 강화는 P5)
          });
      }, delayMs);
    },
    [delayMs],
  );

  // 언마운트 시 마운트 플래그 해제 + 보류 중인 타이머 정리.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { status, notifyChange };
}
