import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { idKey } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';
import Editor from '@/components/editor/Editor';

// T8 / AC-7, FR-6: 에디터는 DocState 파생 EditorBlockView(id:RgaId)를 렌더하고,
// 텍스트 변경은 onBlockInput(blockId,newText)으로만 전달한다. 구조 편집은 비활성.
const id = (n: number): RgaId => ({ counter: n, siteId: 'A' });
const block = (n: number, type: EditorBlockView['type'], text: string): EditorBlockView => ({
  id: id(n),
  type,
  text,
});
const el = (container: HTMLElement, blockId: RgaId) =>
  container.querySelector(`[data-block-id="${idKey(blockId)}"]`) as HTMLElement;

describe('Editor — CRDT 블록 에디터 (P5)', () => {
  it('I2: 접근성 그룹(role=group, 레이블)을 갖는다', () => {
    render(<Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={vi.fn()} />);
    expect(screen.getByRole('group', { name: '페이지 본문' })).toBeInTheDocument();
  });

  it('PR#8-2: whitespace-pre-wrap이 적용된다', () => {
    const { container } = render(<Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={vi.fn()} />);
    expect(el(container, id(1)).className).toContain('whitespace-pre-wrap');
  });

  it('AC-7: EditorBlockView에서 타입별 시맨틱 태그로 렌더한다', () => {
    render(
      <Editor
        blocks={[block(1, 'heading1', 'Title'), block(2, 'paragraph', 'body'), block(3, 'bullet', 'item')]}
        onBlockInput={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('item');
  });

  it('AC-7: 타이핑(input)이 onBlockInput(blockId, newText)으로 전달된다', () => {
    const spy = vi.fn();
    const { container } = render(<Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={spy} />);
    const node = el(container, id(1));
    node.textContent = '안';
    fireEvent.input(node);
    expect(spy).toHaveBeenCalledWith(id(1), '안');
  });

  it('IME 조합 중 input은 무시되고 compositionend에서 최종 텍스트로 1회 전달된다', () => {
    const spy = vi.fn();
    const { container } = render(<Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={spy} />);
    const node = el(container, id(1));
    fireEvent.compositionStart(node);
    node.textContent = '가';
    fireEvent.input(node);
    expect(spy).not.toHaveBeenCalled(); // 조합 중 무시
    node.textContent = '각';
    fireEvent.compositionEnd(node);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(id(1), '각');
  });

  it('구조 편집 비활성: Enter는 분할하지 않고 기본 동작을 막는다', () => {
    const spy = vi.fn();
    const { container } = render(<Editor blocks={[block(1, 'paragraph', 'ab')]} onBlockInput={spy} />);
    const prevented = !fireEvent.keyDown(el(container, id(1)), { key: 'Enter' });
    expect(prevented).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('구조 편집 비활성: 블록 시작 Backspace는 병합하지 않고 기본 동작을 막는다', () => {
    const spy = vi.fn();
    const { container } = render(<Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={spy} />);
    // 빈 블록(캐럿 offset 0)에서 Backspace → 병합 시도 차단.
    const prevented = !fireEvent.keyDown(el(container, id(1)), { key: 'Backspace' });
    expect(prevented).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

// P9 / AC-B1~B4: 구조 편집 콜백 배선 — onEnter / onBackspace / onSetType
describe('Editor — 구조 편집 콜백 배선 (P9)', () => {
  // AC-B1 배선: Enter 키 → onEnter(blockId, caretOffset) 호출
  it('AC-B1: Enter 키 → preventDefault + onEnter(blockId, offset) 호출', () => {
    const onEnter = vi.fn();
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'Hello')]}
        onBlockInput={vi.fn()}
        onEnter={onEnter}
      />,
    );
    const node = el(container, id(1));
    const prevented = !fireEvent.keyDown(node, { key: 'Enter' });
    expect(prevented).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    // 첫 번째 인자는 blockId(RgaId 객체), 두 번째는 offset(number)
    const [calledBlockId, calledOffset] = onEnter.mock.calls[0]!;
    expect(calledBlockId).toEqual(id(1));
    expect(typeof calledOffset).toBe('number');
  });

  // AC-B2 배선: Backspace at offset 0 → onBackspace(blockId) 호출
  // 빈 블록(text.length=0)을 사용 — jsdom에서 getSelection이 없으면 fallback=text.length=0 → 조건 충족.
  it('AC-B2: 빈 블록에서 Backspace → preventDefault + onBackspace(blockId) 호출', () => {
    const onBackspace = vi.fn();
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'Hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
        onBackspace={onBackspace}
      />,
    );
    // 빈 두 번째 블록: text.length=0 → fallback=0 → offset 0 조건 충족
    const node = el(container, id(2));
    const prevented = !fireEvent.keyDown(node, { key: 'Backspace' });
    expect(prevented).toBe(true);
    expect(onBackspace).toHaveBeenCalledTimes(1);
    expect(onBackspace).toHaveBeenCalledWith(id(2));
  });

  // AC-B4 배선: '# ' 입력 → onSetType('heading1') 호출
  it('AC-B4: "# " 입력 → onSetType(blockId, "heading1") 호출', () => {
    const onSetType = vi.fn();
    const onBlockInput = vi.fn();
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', '')]}
        onBlockInput={onBlockInput}
        onSetType={onSetType}
      />,
    );
    const node = el(container, id(1));
    // '# ' prefix를 포함한 텍스트 입력 시뮬레이션
    node.textContent = '# ';
    fireEvent.input(node);
    expect(onSetType).toHaveBeenCalledTimes(1);
    expect(onSetType).toHaveBeenCalledWith(id(1), 'heading1');
  });

  // onEnter prop 없을 때 Enter → TypeError 없이 무시
  it('onEnter prop 없을 때 Enter → 에러 없이 preventDefault만', () => {
    const { container } = render(
      <Editor blocks={[block(1, 'paragraph', 'ab')]} onBlockInput={vi.fn()} />,
    );
    expect(() => {
      fireEvent.keyDown(el(container, id(1)), { key: 'Enter' });
    }).not.toThrow();
  });

  // onBackspace prop 없을 때 Backspace at 0 → TypeError 없이 무시
  it('onBackspace prop 없을 때 Backspace at 0 → 에러 없이 preventDefault만', () => {
    const { container } = render(
      <Editor blocks={[block(1, 'paragraph', '')]} onBlockInput={vi.fn()} />,
    );
    expect(() => {
      fireEvent.keyDown(el(container, id(1)), { key: 'Backspace' });
    }).not.toThrow();
  });
});
