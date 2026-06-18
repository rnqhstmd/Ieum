import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/page';

describe('Landing', () => {
  it('AC-14: IEUM 워드마크 + 헤드라인(h1) + 고스트 pill CTA(로그인 진입)가 표시된다', () => {
    render(<LandingPage />);

    expect(screen.getAllByText('IEUM').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: 'Google로 시작' });
    expect(cta).toHaveAttribute('href', '/login');
  });
});
