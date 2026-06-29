import Link from 'next/link';

import { Constellation } from '@/components/landing/Constellation';

const NAV_MENU = ['Product', 'Pricing', 'Security'] as const;

const FOOTER_COLUMNS: ReadonlyArray<{ header: string; items: readonly string[] }> = [
  { header: 'Product', items: ['기능', '가격', '변경 사항'] },
  { header: 'Company', items: ['소개', '블로그', '채용'] },
  { header: 'Resources', items: ['문서', '보안', '상태'] },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-deep text-ink">
      {/* nav */}
      <nav className="flex items-center justify-between border-b border-hair px-5 py-[18px] sm:px-9 sm:py-[22px]">
        <div className="flex items-center">
          <span className="text-[17px] font-extrabold tracking-[2.5px] text-ink sm:text-[19px] sm:tracking-[3px]">
            IEUM
          </span>
          <ul className="ml-11 hidden items-center gap-7 sm:flex">
            {NAV_MENU.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  className="appearance-none border-0 bg-transparent p-0 text-[12px] font-semibold uppercase tracking-[1.4px] text-dim cursor-pointer"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/login" className="hidden text-[14px] font-medium text-ink sm:block">
          로그인
        </Link>
        <button
          type="button"
          aria-label="메뉴 열기"
          className="flex flex-col gap-1 sm:hidden"
        >
          <span className="h-[2px] w-[22px] bg-ink" />
          <span className="h-[2px] w-[22px] bg-ink" />
          <span className="h-[2px] w-[22px] bg-ink" />
        </button>
      </nav>

      {/* hero */}
      <section className="relative overflow-hidden px-[22px] pb-[72px] pt-[64px] sm:px-8 sm:pb-[150px] sm:pt-[132px]">
        <Constellation opacity={0.55} />
        <div className="relative z-[2] mx-auto max-w-[820px] text-center">
          <p className="text-[11px] font-semibold uppercase leading-[2] tracking-[2.4px] text-accent sm:text-[12px]">
            Real-time collaborative docs
          </p>
          <h1 className="mt-[18px] text-[40px] font-extrabold leading-none tracking-[-1.2px] text-ink sm:text-[80px] sm:tracking-[-2px]">
            생각을 잇다
          </h1>
          <p className="mx-auto mb-[38px] mt-[26px] max-w-[300px] text-[15px] leading-[1.6] text-body sm:max-w-[540px] sm:text-[18px] sm:leading-[1.65]">
            팀이 하나의 문서에서 동시에 쓰고, 페이지로 정리하고, 서로의 커서를 실시간으로 봅니다.
            덮어쓰기 걱정 없이 모두에게 즉시 반영됩니다.
          </p>
          <Link
            href="/login"
            className="mx-auto flex w-full max-w-[260px] items-center justify-center gap-[9px] rounded-[32px] border border-ink px-[28px] py-[18px] text-[13px] font-bold tracking-[0.4px] text-ink transition hover:bg-hover sm:inline-flex sm:w-auto sm:max-w-none"
          >
            Google로 시작 →
          </Link>
        </div>
      </section>

      {/* band 01 */}
      <section className="border-t border-hair bg-surface px-[22px] py-[48px] sm:px-8 sm:py-[88px]">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-12 sm:flex-row sm:items-center sm:justify-between sm:gap-[72px]">
          <div className="sm:max-w-[440px]">
            <p className="text-[12px] font-semibold uppercase tracking-[2px] text-faint">
              실시간 공동 편집
            </p>
            <h2 className="mt-4 text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] text-ink sm:text-[42px] sm:tracking-[-1.4px]">
              같이, 실시간으로 편집
            </h2>
            <p className="mt-5 text-[15px] leading-[1.7] text-dim sm:text-[16px]">
              모두의 커서가 한 화면에 모입니다. 누가 무엇을 바꾸는지 글자 단위로 보이고, 변경은 즉시
              모두에게 반영됩니다.
            </p>
          </div>

          {/* 에디터 미리보기 카드 */}
          <div className="relative w-full flex-none rounded-[8px] border border-hair bg-deep px-[28px] py-[26px] sm:w-[480px]">
            <div aria-hidden="true" className="mb-4 h-[9px] w-[60%] rounded-[2px] bg-[var(--c-fill-a)]" />
            <div aria-hidden="true" className="mb-3 h-[9px] w-[92%] rounded-[2px] bg-[var(--c-fill-b)]" />
            <div aria-hidden="true" className="mb-3 h-[9px] w-[84%] rounded-[2px] bg-[var(--c-fill-b)]" />
            <div aria-hidden="true" className="h-[9px] w-[70%] rounded-[2px] bg-[var(--c-fill-b)]" />

            {/* presence: 민지 */}
            <div
              aria-hidden="true"
              className="absolute left-[150px] top-[34px] sm:left-[200px] sm:top-[40px]"
            >
              <div className="relative h-[18px] w-[2px]" style={{ background: '#6fd6e8' }}>
                <span
                  className="absolute -top-4 left-0 whitespace-nowrap rounded-[3px] px-[6px] py-[3px] text-[9px] font-bold text-black"
                  style={{ background: '#6fd6e8' }}
                >
                  민지
                </span>
              </div>
            </div>

            {/* presence: 준 (데스크탑만) */}
            <div aria-hidden="true" className="absolute left-[120px] top-[88px] hidden sm:block">
              <div className="relative h-[18px] w-[2px]" style={{ background: '#e8c06f' }}>
                <span
                  className="absolute -top-4 left-0 whitespace-nowrap rounded-[3px] px-[6px] py-[3px] text-[9px] font-bold text-black"
                  style={{ background: '#e8c06f' }}
                >
                  준
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-hair bg-deep px-[22px] pb-[28px] pt-[32px] sm:px-9 sm:pb-[34px] sm:pt-[56px]">
        <div className="mx-auto flex max-w-[1080px] justify-between gap-12">
          <div className="max-w-[280px]">
            <span className="text-[16px] font-extrabold tracking-[3px] text-ink sm:text-[18px]">
              IEUM
            </span>
            <p className="mt-3 text-[13px] leading-[1.6] text-faint">
              팀을 위한 실시간 협업 문서. 검정 캔버스 위에서, 조용하게.
            </p>
          </div>
          <div className="hidden gap-16 sm:flex">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.header}>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[1.6px] text-[var(--c-fainter)]">
                  {col.header}
                </p>
                <ul className="text-[13px] leading-[2.1] text-body">
                  {col.items.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        className="appearance-none border-0 bg-transparent p-0 leading-[2.1] text-body cursor-pointer"
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-9 flex max-w-[1080px] justify-between border-t border-hair-3 pt-[22px]">
          <p className="text-[12px] tracking-[0.6px] text-faint sm:text-[var(--c-fainter)]">
            © 2026 IEUM. ALL SYSTEMS NOMINAL.
          </p>
          <p className="hidden text-[12px] tracking-[0.6px] text-[var(--c-fainter)] sm:block">
            한국어 · 개인정보 · 약관
          </p>
        </div>
      </footer>
    </div>
  );
}
