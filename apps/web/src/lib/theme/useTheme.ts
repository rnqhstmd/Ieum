// 테마 상태 훅 — dataset.theme 동기화, toggleTheme 저장/반전, 인스턴스 간 pub/sub 동기화.

import { useCallback, useEffect, useState } from 'react';

const THEME_CHANGE_EVENT = 'ieum-theme-change';

export function useTheme(): { theme: '다크' | '라이트'; toggleTheme: () => void } {
  const [theme, setTheme] = useState<'다크' | '라이트'>('다크');

  // document.documentElement.dataset.theme 값을 읽어 라벨 상태를 동기화한다.
  const syncFromDom = useCallback(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? '라이트' : '다크');
  }, []);

  useEffect(() => {
    syncFromDom();
    window.addEventListener(THEME_CHANGE_EVENT, syncFromDom);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromDom);
    };
  }, [syncFromDom]);

  const toggleTheme = useCallback(() => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('ieum-theme', next);
    } catch {
      // 저장 실패 무시
    }
    setTheme(next === 'light' ? '라이트' : '다크');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, toggleTheme };
}
