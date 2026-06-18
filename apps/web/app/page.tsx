import Link from 'next/link';

const BANDS: ReadonlyArray<readonly [string, string]> = [
  ['실시간 공동편집', '자체 RGA CRDT로 충돌 없는 동시 편집을 구현합니다.'],
  ['중첩 페이지 트리', '무한 중첩으로 팀의 지식을 자유롭게 구조화합니다.'],
  ['Presence', '누가 보고 있는지, 커서가 어디 있는지 실시간으로 확인합니다.'],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-deep text-ink">
      {/* 오버레이 nav */}
      <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="text-xl font-extrabold tracking-[2px]">IEUM</span>
        <Link
          href="/login"
          className="text-xs font-semibold uppercase tracking-[1.2px] text-body transition hover:text-ink"
        >
          로그인
        </Link>
      </nav>

      {/* full-bleed 다크 히어로 */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#16161b_0%,#000000_72%)]"
        />
        <div className="relative">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[2px] text-faint">실시간 협업 문서</p>
          <h1 className="text-5xl font-extrabold uppercase leading-[0.95] tracking-[1.6px] sm:text-7xl">
            생각을 잇고
            <br />
            사람을 잇다
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-body">
            중첩 페이지, 실시간 공동편집, presence — 팀의 지식을 한곳에서 잇는 협업 문서 공간.
          </p>
          <Link
            href="/login"
            className="mt-9 inline-flex items-center justify-center rounded-full border border-ink px-6 py-3.5 text-xs font-bold uppercase tracking-[1.17px] text-ink transition hover:bg-hover"
          >
            Google로 시작
          </Link>
        </div>
      </section>

      {/* 제품 핵심 밴드 */}
      <section className="border-t border-hair-2 px-6 py-20 sm:px-10">
        <div className="mx-auto grid max-w-5xl gap-12 sm:grid-cols-3">
          {BANDS.map(([title, desc]) => (
            <div key={title}>
              <h2 className="text-lg font-bold uppercase tracking-[0.96px]">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-body">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-hair-2 px-6 py-8 text-center text-xs text-faint sm:px-10">
        © 2026 IEUM. 모든 권리 보유.
      </footer>
    </div>
  );
}
