import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TitleEditor from '@/components/editor/TitleEditor';

function Harness({ initial, spy }: { initial: string; spy?: (t: string) => void }) {
  const [t, setT] = useState(initial);
  return (
    <TitleEditor
      title={t}
      onChange={(v) => {
        setT(v);
        spy?.(v);
      }}
    />
  );
}

describe('TitleEditor — 페이지 제목 인라인 편집 (W1)', () => {
  it('W1-a: title을 편집 가능한 textbox로 렌더한다', () => {
    render(<TitleEditor title="My Page" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: '페이지 제목' })).toHaveTextContent('My Page');
  });

  it('W1-b: 입력 시 onChange(title)이 호출된다', () => {
    const spy = vi.fn();
    render(<Harness initial="" spy={spy} />);
    const el = screen.getByRole('textbox', { name: '페이지 제목' });
    el.textContent = '새 제목';
    fireEvent.input(el);
    expect(spy).toHaveBeenLastCalledWith('새 제목');
  });

  it('W1-c: Enter는 줄바꿈을 막는다(제목은 한 줄)', () => {
    render(<TitleEditor title="t" onChange={vi.fn()} />);
    const el = screen.getByRole('textbox', { name: '페이지 제목' });
    // fireEvent는 default가 막히면 false를 반환한다.
    expect(fireEvent.keyDown(el, { key: 'Enter' })).toBe(false);
  });
});
