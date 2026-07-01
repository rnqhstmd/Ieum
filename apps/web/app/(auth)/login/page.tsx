// 로그인 페이지 — Spring Security OAuth2 경유 Google 로그인 (IEUM 디자인 변형 A)
// 컨스텔레이션 배경 + 미니멀 로그인. 버튼 클릭 시 백엔드의 OAuth2 인가 엔드포인트로 이동.

import { Constellation } from '@/components/landing/Constellation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === '1';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-deep px-7 text-center text-ink sm:px-8">
      <Constellation opacity={0.4} />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center sm:w-auto sm:max-w-none">
        {/* 워드마크 */}
        <span className="text-[26px] font-extrabold tracking-[4px] text-ink sm:text-[30px] sm:tracking-[5px]">
          IEUM
        </span>

        {/* 배지 */}
        <p className="mt-[14px] text-[10px] font-semibold uppercase tracking-[2px] text-accent sm:mt-[18px] sm:text-[11px] sm:tracking-[2.4px]">
          <span className="sm:hidden">Real-time docs</span>
          <span className="hidden sm:inline">Real-time collaborative docs</span>
        </p>

        {/* 카피 */}
        <p className="mb-[32px] mt-[18px] text-[15px] leading-[1.6] text-body sm:mb-[40px] sm:mt-[22px] sm:text-[17px]">
          함께 쓰는 문서, <br className="sm:hidden" />하나의 워크스페이스.
        </p>

        {/* CTA 고스트 pill */}
        <a
          href={`${API_URL}/oauth2/authorization/google`}
          className="flex w-full items-center justify-center gap-[11px] rounded-full border border-ink px-6 py-4 text-[14px] font-bold text-ink transition hover:bg-hover sm:inline-flex sm:w-auto sm:px-7"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-black"
          >
            G
          </span>
          Google로 로그인
        </a>

        {/* 약관 caption */}
        <p className="mt-[28px] text-[12px] leading-[1.6] text-fainter sm:mt-[34px] sm:max-w-[320px] sm:text-[12.5px]">
          계속하면 이음의{' '}
          <span className="text-dim underline underline-offset-[3px]">서비스 약관</span>과{' '}
          <span className="text-dim underline underline-offset-[3px]">개인정보 처리방침</span>에 동의하게 됩니다.
        </p>
      </div>
      {/* ⚠ DEV 전용 로그인 — NEXT_PUBLIC_DEV_LOGIN=1 + 백엔드 dev 프로파일에서만 노출/동작 */}
      {DEV_LOGIN && (
        <div className="relative z-10 mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-faint px-6 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-faint">
            ⚠ DEV 전용 로그인 (OAuth 우회)
          </p>
          <div className="flex gap-3">
            <a
              href={`${API_URL}/api/dev/login?email=alice@dev.local`}
              className="rounded-full border border-ink px-5 py-2.5 text-xs font-bold text-ink transition hover:bg-hover"
            >
              alice 로그인
            </a>
            <a
              href={`${API_URL}/api/dev/login?email=bob@dev.local`}
              className="rounded-full border border-ink px-5 py-2.5 text-xs font-bold text-ink transition hover:bg-hover"
            >
              bob 로그인
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
