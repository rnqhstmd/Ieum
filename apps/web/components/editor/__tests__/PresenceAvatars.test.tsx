import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PresenceAvatars from '@/components/editor/PresenceAvatars';
import type { PresenceInfo } from '@/src/lib/realtime/protocol';

// P6 / AC-4,5,7 · BR-8: 아바타 목록은 presentational(props만) — 데이터 출처와 분리되어 render 검증.
const info = (clientId: string, displayName: string, color: string): PresenceInfo => ({
  clientId,
  displayName,
  color,
});

describe('PresenceAvatars (아바타 목록)', () => {
  it('AC-4: 각 접속자를 displayName 레이블 배지로 렌더한다', () => {
    render(
      <PresenceAvatars
        presences={[info('c1', '사용자 #a1b2', '#E57373'), info('c2', '사용자 #c3d4', '#64B5F6')]}
      />,
    );
    expect(screen.getByRole('listitem', { name: '사용자 #a1b2' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '사용자 #c3d4' })).toBeInTheDocument();
  });

  it('AC-4: 색상이 배지에 적용된다', () => {
    render(<PresenceAvatars presences={[info('c1', '사용자 #a1b2', '#E57373')]} />);
    expect(screen.getByRole('listitem', { name: '사용자 #a1b2' })).toHaveAttribute(
      'data-color',
      '#E57373',
    );
  });

  it('이니셜은 "#" 뒤 첫 글자를 대문자로 표기한다', () => {
    render(<PresenceAvatars presences={[info('c1', '사용자 #a1b2', '#E57373')]} />);
    expect(screen.getByRole('listitem', { name: '사용자 #a1b2' })).toHaveTextContent('A');
  });

  it('AC-7: self 포함 — 모든 접속자를 동일하게 렌더한다(강조 없음)', () => {
    render(<PresenceAvatars presences={[info('self', '사용자 #self', '#81C784')]} />);
    expect(screen.getByRole('listitem', { name: '사용자 #self' })).toBeInTheDocument();
  });

  it('BR-8: 빈 목록이면 아바타 항목이 없고 컨테이너만 렌더한다', () => {
    render(<PresenceAvatars presences={[]} />);
    expect(screen.getByRole('list', { name: '접속자' })).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
