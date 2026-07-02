import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import EditorContainer from '../EditorContainer';
import { ToastProvider } from '@/components/states/ToastProvider';

// WS-AUTH-01 AC-10: authError=true 시 data-testid="auth-error"(role=alert) 렌더.
// useCrdtDocument를 vi.mock으로 대체하여 authError 상태를 제어한다.

// hoisted 목 — saveTitle을 성공/실패로 제어하고, useAutosave가 받은 save-port(saveWithToast)를
// 캡처한다. 기존 테스트는 useAutosave를 no-op으로 목킹해 save/toast 경로가 실행되지 않으므로,
// AC-9/10/13 토스트 검증은 캡처한 saveWithToast를 직접 호출해 목을 우회한다(디자인 8절 (b) 셋업).
const mocks = vi.hoisted(() => ({
  saveTitle: vi.fn((_next: string) => Promise.resolve()),
  capturedSave: { current: null as ((data: string) => void | Promise<void>) | null },
}));

vi.mock('@/src/lib/editor/useCrdtDocument', () => ({
  useCrdtDocument: vi.fn(),
}));

// useAutosave: 기존과 동일한 no-op 반환({status:'idle', notifyChange})을 유지하되, 전달된
// save-port(saveWithToast)를 캡처해 토스트 경로를 직접 태울 수 있게 한다.
vi.mock('@/src/lib/editor/useAutosave', () => ({
  useAutosave: (save: (data: string) => void | Promise<void>) => {
    mocks.capturedSave.current = save;
    return { status: 'idle', notifyChange: vi.fn() };
  },
}));

// usePageTitle: saveTitle을 제어 가능한 목으로 노출(성공/실패 시나리오 주입).
vi.mock('@/src/lib/editor/usePageTitle', () => ({
  usePageTitle: () => ({ title: '', setTitle: vi.fn(), saveTitle: mocks.saveTitle }),
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
  connectionStatus: 'online' as const,
};

beforeEach(() => {
  // 각 테스트 사이 saveTitle 호출 이력·구현·캡처 참조를 초기화한다.
  mocks.saveTitle.mockReset();
  mocks.saveTitle.mockResolvedValue(undefined);
  mocks.capturedSave.current = null;
});

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

describe('EditorContainer — 제목 저장 실패 토스트 (saveWithToast)', () => {
  it('AC-9: saveTitle이 reject되면 저장 시도 후 role=alert 토스트가 노출된다', async () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult });
    mocks.saveTitle.mockRejectedValue(new Error('save failed'));

    render(
      <ToastProvider>
        <EditorContainer pageId="pg_1" />
      </ToastProvider>,
    );

    // useAutosave가 캡처한 save-port(saveWithToast)를 직접 호출한다.
    const save = mocks.capturedSave.current;
    expect(save).not.toBeNull();
    await act(async () => {
      // rethrow되므로 Promise.resolve로 감싸 catch한다(useAutosave의 호출 방식과 동일).
      await Promise.resolve(save!('새 제목')).catch(() => {});
    });

    // 저장 시도가 실제로 발생
    expect(mocks.saveTitle).toHaveBeenCalledWith('새 제목');
    // 실패 → 오류 토스트(role=alert) 노출
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('변경사항을 저장하지 못했습니다.');
  });

  it('AC-10: 토스트 "다시 시도" 클릭 시 saveTitle이 동일 인자로 재호출된다', async () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult });
    mocks.saveTitle.mockRejectedValue(new Error('save failed'));

    render(
      <ToastProvider>
        <EditorContainer pageId="pg_1" />
      </ToastProvider>,
    );

    const save = mocks.capturedSave.current!;
    await act(async () => {
      await Promise.resolve(save('제목-X')).catch(() => {});
    });
    expect(mocks.saveTitle).toHaveBeenCalledTimes(1);

    // "다시 시도" 클릭 → 직전 실패한 동일 next('제목-X')로 saveTitle 재호출(클로저 캡처).
    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    expect(mocks.saveTitle).toHaveBeenCalledTimes(2);
    expect(mocks.saveTitle).toHaveBeenLastCalledWith('제목-X');
  });

  it('AC-10: 재시도가 성공하면 토스트가 소멸한다', async () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult });
    // 첫 저장 실패 → 이후 재시도 성공.
    mocks.saveTitle.mockRejectedValueOnce(new Error('save failed'));
    mocks.saveTitle.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <EditorContainer pageId="pg_1" />
      </ToastProvider>,
    );

    const save = mocks.capturedSave.current!;
    await act(async () => {
      await Promise.resolve(save('제목-Y')).catch(() => {});
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    // 재시도 성공 → dismiss()로 토스트 소멸.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('회귀(수정1): 실패 토스트 노출 중, 이후 주 저장 시도가 성공하면 토스트가 사라진다', async () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult });
    // 첫 저장 실패 → 두 번째(주 저장 경로) 성공.
    mocks.saveTitle.mockRejectedValueOnce(new Error('save failed'));
    mocks.saveTitle.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <EditorContainer pageId="pg_1" />
      </ToastProvider>,
    );

    const save = mocks.capturedSave.current!;
    // 1) 첫 저장 실패 → 실패 토스트 노출
    await act(async () => {
      await Promise.resolve(save('t1')).catch(() => {});
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // 2) retry 버튼이 아닌 주 저장 경로(saveWithToast)가 다시 성공 → 잔여 실패 토스트 정리(수정1)
    await act(async () => {
      await Promise.resolve(save('t2')).catch(() => {});
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AC-13: 연속 2회 저장 실패 시 토스트는 1개만 유지된다(교체)', async () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult });
    mocks.saveTitle.mockRejectedValue(new Error('save failed'));

    render(
      <ToastProvider>
        <EditorContainer pageId="pg_1" />
      </ToastProvider>,
    );

    const save = mocks.capturedSave.current!;
    await act(async () => {
      await Promise.resolve(save('t1')).catch(() => {});
      await Promise.resolve(save('t2')).catch(() => {});
    });

    // authError/restoreError 미렌더 → alert는 토스트 하나뿐(단일 교체).
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('EditorContainer — 연결 상태 배너 (ConnectionBanner)', () => {
  it("AC-16: connectionStatus='online'이면 연결 배너를 렌더하지 않는다(명시 equality)", () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, connectionStatus: 'online' });
    render(<EditorContainer pageId="pg_1" />);
    expect(screen.queryByText('오프라인 — 변경사항을 저장하지 못했습니다.')).toBeNull();
    expect(screen.queryByText('다시 연결됨')).toBeNull();
  });

  it("AC-14 근거: connectionStatus='offline'이면 오프라인 배너를 렌더한다", () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, connectionStatus: 'offline' });
    render(<EditorContainer pageId="pg_1" />);
    expect(screen.getByText('오프라인 — 변경사항을 저장하지 못했습니다.')).toBeInTheDocument();
  });

  it("AC-15 근거: connectionStatus='reconnected'이면 재연결 배너를 렌더한다", () => {
    vi.mocked(useCrdtDocument).mockReturnValue({ ...baseResult, connectionStatus: 'reconnected' });
    render(<EditorContainer pageId="pg_1" />);
    // 재연결 문구는 "다시 연결됨"까지만 단정한다("모든 변경사항 저장됨" 제거 — 수정3).
    expect(screen.getByText('다시 연결됨')).toBeInTheDocument();
  });

  // AC-18 근거: 배너는 EditorContainer 내부에만 렌더되며 'online'/undefined에는 나타나지 않는다.
  // 대시보드/멤버 화면은 EditorContainer를 마운트하지 않으므로 배너가 노출되지 않는다(구조적 보장).
});
