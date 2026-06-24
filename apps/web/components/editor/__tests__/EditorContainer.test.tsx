import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditorContainer from '../EditorContainer';

// WS-AUTH-01 AC-10: authError=true 시 data-testid="auth-error"(role=alert) 렌더.
// useCrdtDocument를 vi.mock으로 대체하여 authError 상태를 제어한다.

vi.mock('@/src/lib/editor/useCrdtDocument', () => ({
  useCrdtDocument: vi.fn(),
}));

vi.mock('@/src/lib/editor/useAutosave', () => ({
  useAutosave: () => ({ status: 'idle', notifyChange: vi.fn() }),
}));

vi.mock('@/src/lib/editor/usePageTitle', () => ({
  usePageTitle: () => ({ title: '', setTitle: vi.fn(), saveTitle: vi.fn() }),
}));

// AC-13: Editor를 경량 stub으로 대체 — editor-surface testid로 존재 확인
vi.mock('@/components/editor/Editor', () => ({
  default: () => <div data-testid="editor-surface" />,
}));

import { useCrdtDocument } from '@/src/lib/editor/useCrdtDocument';

const baseResult = {
  blocks: [],
  connectedClients: 0,
  presences: [],
  cursors: [],
  localClientId: null,
  onBlockInput: vi.fn(),
  onCursorMove: vi.fn(),
  resolveCursorIndex: vi.fn(() => 0),
  onEnter: vi.fn(),
  onBackspace: vi.fn(),
  onSetType: vi.fn(),
  authError: false,
  restoreError: false,
  retryRestore: vi.fn(),
};

describe('EditorContainer — WS-AUTH-01 authError UI', () => {
  it('authError=false 일 때 auth-error 알림이 렌더되지 않는다', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, authError: false });
    render(<EditorContainer pageId="pg_1" />);
    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  it('authError=true 일 때 role=alert + data-testid="auth-error" 엘리먼트가 렌더된다', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, authError: true });
    render(<EditorContainer pageId="pg_1" />);
    const alert = screen.getByTestId('auth-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('authError=true 일 때 /login 링크가 포함된다', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, authError: true });
    render(<EditorContainer pageId="pg_1" />);
    const link = screen.getByRole('link', { name: /login/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});

describe('EditorContainer — 복원 실패 UX (restoreError)', () => {
  it('AC-12: restoreError=false 일 때 restore-error 배너가 렌더되지 않는다', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, restoreError: false });
    render(<EditorContainer pageId="pg_1" />);
    expect(screen.queryByTestId('restore-error')).toBeNull();
  });

  it('AC-12: restoreError=true 일 때 data-testid="restore-error" 배너와 재시도 버튼이 렌더된다', () => {
    const retryFn = vi.fn();
    vi.mocked(useCrdtDocument).mockReturnValue({
      ...baseResult,
      restoreError: true,
      retryRestore: retryFn,
    });
    render(<EditorContainer pageId="pg_1" />);

    // 배너 존재
    expect(screen.getByTestId('restore-error')).toBeInTheDocument();

    // 재시도 버튼 존재
    const btn = screen.getByRole('button', { name: /재시도/ });
    expect(btn).toBeInTheDocument();

    // 버튼 클릭 시 retryRestore 호출
    fireEvent.click(btn);
    expect(retryFn).toHaveBeenCalled();
  });

  it('AC-13: restoreError=true 일 때 배너와 에디터 영역이 동시에 렌더된다(편집 미차단)', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, restoreError: true });
    render(<EditorContainer pageId="pg_1" />);

    // 배너와 에디터가 동시에 존재해야 한다
    expect(screen.getByTestId('restore-error')).toBeInTheDocument();
    expect(screen.getByTestId('editor-surface')).toBeInTheDocument();
  });

  // ── 하드닝 (2): authError 시 restoreError 배너 억제 ─────────────
  it('HARD-2: authError=true이면 restoreError 배너를 렌더하지 않는다(세션 만료 시 복원 무의미)', () => {
    vi.mocked(useCrdtDocument).mockReturnValue({
      ...baseResult,
      authError: true,
      restoreError: true,
    });
    render(<EditorContainer pageId="pg_1" />);

    // auth-error는 존재해야 한다
    expect(screen.getByTestId('auth-error')).toBeInTheDocument();

    // authError가 true이면 restoreError 배너는 억제돼야 한다 — 미구현 시 RED
    expect(screen.queryByTestId('restore-error')).toBeNull();
  });
});
