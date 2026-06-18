import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">이음</h1>
        <p className="mt-4 text-lg text-gray-500">
          생각을 잇고, 사람을 잇는 실시간 협업 문서 공간
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          시작하기 — Google로 로그인
        </Link>
      </div>

      <footer className="absolute bottom-6 text-xs text-gray-400">
        © 2026 이음. 모든 권리 보유.
      </footer>
    </main>
  );
}
