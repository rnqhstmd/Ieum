'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ErrorToast from './ErrorToast';

/** 토스트 자동 소멸까지의 시간(ms). */
const AUTO_DISMISS_MS = 5000;

/** 전역 토스트 조작 API. Provider 밖에서는 no-op 기본값이 반환된다. */
export interface ToastApi {
  showError(message: string, opts?: { onRetry?: () => void }): void;
  dismiss(): void;
}

/** 단일 토스트 상태. 교체 방식 — 새 showError가 기존 토스트를 덮어쓴다(AC-13). */
interface ToastState {
  message: string;
  onRetry?: () => void;
  // 논리적 토스트마다 증가하는 고유 id(내부용). ErrorToast의 key로 사용해 교체 시
  // 새로 마운트되게 함으로써 retried 로컬 state 누수를 막는다.
  id: number;
}

// Provider 밖에서 useToast를 호출해도 안전하도록 no-op 기본값을 둔다(하위 호환 — throw 금지).
const ToastContext = createContext<ToastApi>({
  showError() {},
  dismiss() {},
});

/** 전역 단일 토스트 Provider. 앱 셸을 감싸 어디서든 useToast로 저장 실패 등 오류를 노출한다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  // 자동 소멸 타이머 핸들 — showError/dismiss/언마운트 시 clear 대상.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 토스트 고유 id 발급용 단조 증가 카운터(결정성 — Date.now/Math.random 미사용).
  const seqRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showError = useCallback(
    (message: string, opts?: { onRetry?: () => void }) => {
      // 교체 방식 — 기존 타이머를 지우고 새 토스트로 덮어쓴 뒤 5초 재설정(AC-11/AC-13).
      clearTimer();
      seqRef.current += 1;
      setToast({ message, onRetry: opts?.onRetry, id: seqRef.current });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setToast(null);
      }, AUTO_DISMISS_MS);
    },
    [clearTimer],
  );

  // 언마운트 시 살아있는 타이머 정리.
  useEffect(() => clearTimer, [clearTimer]);

  // context value를 메모이즈 — showError/dismiss가 안정적이라 참조가 고정되어, 토스트 변동 시
  // useToast 소비자(EditorContainer 등)의 불필요한 재렌더를 막는다.
  const api = useMemo<ToastApi>(() => ({ showError, dismiss }), [showError, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* 초기 toast=null → SSR에서 미렌더(하이드레이션 안전). 우하단 fixed 포털로
          AppShell의 transform 컨테이닝 블록을 벗어나 화면 우하단에 고정한다. */}
      {toast &&
        createPortal(
          <div className="fixed bottom-6 right-6 z-50">
            <ErrorToast
              key={toast.id}
              message={toast.message}
              onRetry={toast.onRetry}
              onDismiss={dismiss}
            />
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/** 전역 토스트 API 훅. Provider 밖에서는 no-op을 반환한다(하위 호환). */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
