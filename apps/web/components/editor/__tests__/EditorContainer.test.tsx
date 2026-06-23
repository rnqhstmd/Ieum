import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
