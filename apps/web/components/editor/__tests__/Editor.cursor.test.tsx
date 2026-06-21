import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { idKey } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';
import Editor from '@/components/editor/Editor';
import type { CursorInfo, PresenceInfo } from '@/src/lib/realtime/protocol';

// P6 라이브 커서 / AC-5,7,8: 송신 debounce + 원격 커서 오버레이 렌더.
const BLOCK: RgaId = { counter: 0, siteId: 'genesis' };
const block = (text = ''): EditorBlockView => ({ id: BLOCK, type: 'paragraph', text });
const cursor = (clientId: string): CursorInfo => ({ clientId, blockId: BLOCK, anchorId: null });
const presence = (clientId: string, displayName: string, color: string): PresenceInfo => ({
  clientId,
  displayName,
  color,
});

const baseProps = {
  blocks: [block()],
  onBlockInput: vi.fn(),
  cursors: [] as CursorInfo[],
  presences: [] as PresenceInfo[],
  localClientId: null as string | null,
  resolveCursorIndex: () => 0,
  onCursorMove: vi.fn(),
};

describe('Editor — 라이브 커서', () => {
  it('AC-5: caret 이동 5회가 50ms 내면 onCursorMove가 1회 호출된다(debounce)', () => {
    vi.useFakeTimers();
    try {
      const onCursorMove = vi.fn();
      const { container } = render(<Editor {...baseProps} onCursorMove={onCursorMove} />);
      const el = container.querySelector(`[data-block-id="${idKey(BLOCK)}"]`) as HTMLElement;
      fireEvent.focus(el);
      for (let i = 0; i < 5; i++) fireEvent.keyUp(el);
      vi.advanceTimersByTime(50);
      expect(onCursorMove).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('N-2(FR-1): selectionchange에서도 caret을 캡처해 onCursorMove를 전송한다', () => {
    vi.useFakeTimers();
    try {
      const onCursorMove = vi.fn();
      const { container } = render(<Editor {...baseProps} onCursorMove={onCursorMove} />);
      const el = container.querySelector(`[data-block-id="${idKey(BLOCK)}"]`) as HTMLElement;
      fireEvent.focus(el); // focusedBlock 설정(FR-8)
      document.dispatchEvent(new Event('selectionchange'));
      vi.advanceTimersByTime(50);
      expect(onCursorMove).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-7: 자기 커서(localClientId)는 렌더하지 않는다', () => {
    const { container } = render(
      <Editor
        {...baseProps}
        cursors={[cursor('site-local')]}
        presences={[presence('site-local', '나', '#E57373')]}
        localClientId="site-local"
      />,
    );
    expect(container.querySelector('[data-cursor-client-id="site-local"]')).toBeNull();
  });

  it('AC-8: 원격 커서를 색상·이름 레이블로 렌더한다', () => {
    const { container } = render(
      <Editor
        {...baseProps}
        cursors={[cursor('site-b')]}
        presences={[presence('site-b', '사용자 #bbbb', '#64B5F6')]}
        localClientId="site-local"
      />,
    );
    const cur = container.querySelector('[data-cursor-client-id="site-b"]');
    expect(cur).not.toBeNull();
    expect(cur).toHaveAttribute('data-color', '#64B5F6');
    expect(cur!.textContent).toContain('사용자 #bbbb');
  });

  it('CONSIDER: presence lookup 실패 시 커서를 렌더하지 않는다(1프레임 불일치 방어)', () => {
    const { container } = render(
      <Editor {...baseProps} cursors={[cursor('site-b')]} presences={[]} localClientId="site-local" />,
    );
    expect(container.querySelector('[data-cursor-client-id="site-b"]')).toBeNull();
  });

  it('C5/C12: 현재 blocks에 없는 blockId 커서는 렌더하지 않는다(유령 블록 방어)', () => {
    const otherBlock: CursorInfo = {
      clientId: 'site-b',
      blockId: { counter: 99, siteId: 'other' },
      anchorId: null,
    };
    const { container } = render(
      <Editor
        {...baseProps}
        cursors={[otherBlock]}
        presences={[presence('site-b', '사용자 #bbbb', '#64B5F6')]}
        localClientId="site-local"
      />,
    );
    expect(container.querySelector('[data-cursor-client-id="site-b"]')).toBeNull();
  });
});
