import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Editor from '@/components/editor/Editor';
import type { EditorBlock } from '@/src/lib/editor/document';

/** 실제 controlled 흐름을 재현하는 하네스: onChange가 상태를 갱신하고 스파이로도 흘린다. */
function Harness({
  initial,
  onChangeSpy,
}: {
  initial: EditorBlock[];
  onChangeSpy?: (b: EditorBlock[]) => void;
}) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(initial);
  return (
    <Editor
      blocks={blocks}
      onChange={(b) => {
        setBlocks(b);
        onChangeSpy?.(b);
      }}
    />
  );
}

const el = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-block-id="${id}"]`) as HTMLElement;

describe('Editor — controlled 블록 에디터', () => {
  it('I2: 에디터 영역이 접근성 그룹(role=group, 레이블)을 갖는다', () => {
    render(<Editor blocks={[{ id: 'b1', type: 'paragraph', text: '' }]} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: '페이지 본문' })).toBeInTheDocument();
  });

  it('AC-13: blocks에서 파생하여 타입별 시맨틱 태그로 렌더한다', () => {
    const blocks: EditorBlock[] = [
      { id: 'h', type: 'heading1', text: 'Title' },
      { id: 'p', type: 'paragraph', text: 'body' },
      { id: 'b', type: 'bullet', text: 'item' },
    ];
    render(<Editor blocks={blocks} onChange={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('item');
  });

  it('AC-14: 타이핑(input)이 onChange로 해당 블록 text를 전달한다', () => {
    const spy = vi.fn();
    const { container } = render(
      <Harness initial={[{ id: 'b1', type: 'paragraph', text: '' }]} onChangeSpy={spy} />,
    );

    const node = el(container, 'b1');
    node.textContent = 'hello';
    fireEvent.input(node);

    expect(spy).toHaveBeenCalled();
    const last = spy.mock.calls.at(-1)![0] as EditorBlock[];
    expect(last.find((b) => b.id === 'b1')!.text).toBe('hello');
  });

  it('AC-15: Enter가 블록을 분할하여 개수를 1 늘린다', () => {
    const spy = vi.fn();
    const { container } = render(
      <Harness initial={[{ id: 'b1', type: 'paragraph', text: 'ab' }]} onChangeSpy={spy} />,
    );

    fireEvent.keyDown(el(container, 'b1'), { key: 'Enter' });

    const last = spy.mock.calls.at(-1)![0] as EditorBlock[];
    expect(last).toHaveLength(2);
  });

  it('FR-7: 블록 시작에 "# " 입력 시 heading1으로 변환되고 접두사가 제거된다', () => {
    const spy = vi.fn();
    const { container } = render(
      <Harness initial={[{ id: 'b1', type: 'paragraph', text: '' }]} onChangeSpy={spy} />,
    );

    const node = el(container, 'b1');
    node.textContent = '# ';
    fireEvent.input(node);

    const last = spy.mock.calls.at(-1)![0] as EditorBlock[];
    expect(last[0]!.type).toBe('heading1');
    expect(last[0]!.text).toBe('');
  });

  it('AC-16: 빈 블록에서 Backspace가 블록을 제거한다', () => {
    const spy = vi.fn();
    const { container } = render(
      <Harness
        initial={[
          { id: 'a', type: 'paragraph', text: 'a' },
          { id: 'b', type: 'paragraph', text: '' },
        ]}
        onChangeSpy={spy}
      />,
    );

    fireEvent.keyDown(el(container, 'b'), { key: 'Backspace' });

    const last = spy.mock.calls.at(-1)![0] as EditorBlock[];
    expect(last).toHaveLength(1);
  });
});
