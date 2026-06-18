import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';

describe('Login', () => {
  it('AC-15: "Google로 로그인" CTA가 백엔드 OAuth 인가 엔드포인트로 연결된다', () => {
    render(<LoginPage />);

    const cta = screen.getByRole('link', { name: /Google로 로그인/ });
    expect(cta.getAttribute('href')).toMatch(/\/oauth2\/authorization\/google$/);
  });
});
