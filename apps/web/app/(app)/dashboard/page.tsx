// TODO [Phase 1]: auth() 세션에서 userId 읽어 워크스페이스 목록 조회
// TODO [Phase 2]: 워크스페이스 선택 UI, 최근 페이지 목록 렌더링

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">대시보드</h1>
      <p className="mt-2 text-sm text-gray-500">
        워크스페이스와 페이지 목록이 여기에 표시됩니다.
        {/* TODO [Phase 1]: 실제 데이터 렌더링 */}
      </p>
    </div>
  );
}
