'use client';

// ─── P3 페이지 제목 인라인 편집 (US-PAGE-05 "에디터 상단 인라인 편집") ──────
// controlled contenteditable h1. 제목은 한 줄이므로 Enter는 줄바꿈을 막는다.
// 영속화는 EditorContainer의 save-port를 공유(P5에서 연결).

import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

interface TitleEditorProps {
  title: string;
  onChange: (title: string) => void;
}

export default function TitleEditor({ title, onChange }: TitleEditorProps) {
  const ref = useRef<HTMLHeadingElement | null>(null);

  // 모델 → DOM 단방향 반영(캐럿 점프 방지).
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== title) el.textContent = title;
  }, [title]);

  return (
    <h1
      ref={ref}
      role="textbox"
      aria-label="페이지 제목"
      contentEditable
      suppressContentEditableWarning
      onInput={(e: FormEvent<HTMLHeadingElement>) => onChange(e.currentTarget.textContent ?? '')}
      onKeyDown={(e: KeyboardEvent<HTMLHeadingElement>) => {
        if (e.key === 'Enter') e.preventDefault(); // 제목은 한 줄
      }}
      className="mb-1 text-[30px] font-bold tracking-[-1px] text-ink outline-none empty:before:text-faint empty:before:content-['제목_없음'] sm:text-[40px]"
    />
  );
}
