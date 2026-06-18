// TODO [Phase 1]: auth() 호출로 세션 검증 추가 — 미인증 시 /login redirect
// TODO [Phase 2]: 사이드바(페이지 트리) 컴포넌트 통합 (04-architecture §2-1 참조)

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* 사이드바 자리 — TODO [Phase 2]: <Sidebar /> 컴포넌트 교체 */}
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50">
        <div className="p-4 text-xs text-gray-400">[사이드바 — Phase 2]</div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
