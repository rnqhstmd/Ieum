// 로그인 페이지 — Spring Security OAuth2 경유 Google 로그인 (IEUM 디자인)
// 버튼 클릭 시 백엔드(Spring Boot)의 OAuth2 인가 엔드포인트로 이동.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === '1';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 bg-deep px-6 text-center text-ink">
      <div>
        <div className="text-3xl font-extrabold tracking-[2.5px]">IEUM</div>
        <p className="mt-3 text-sm text-body">생각을 잇고, 사람을 잇다</p>
      </div>

      <a
        href={`${API_URL}/oauth2/authorization/google`}
        className="inline-flex items-center justify-center gap-3 rounded-full border border-ink px-6 py-3.5 text-xs font-bold uppercase tracking-[1.17px] text-ink transition hover:bg-hover"
      >
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#ffffff"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
          />
          <path
            fill="#ffffff"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
          />
        </svg>
        Google로 로그인
      </a>

      {DEV_LOGIN && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-faint px-6 py-4">
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

      <p className="absolute bottom-8 max-w-xs text-[11px] leading-relaxed text-faint">
        계속 진행하면 서비스 약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
      </p>
    </main>
  );
}
