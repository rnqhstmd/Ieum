export default function LoadingSkeleton() {
  return (
    <div aria-hidden className="flex h-full w-full animate-pulse overflow-hidden">
      <aside className="flex w-[200px] flex-none flex-col gap-3 border-r border-hair-2 bg-deep p-4">
        <div className="h-4 w-28 rounded bg-fill-b" />
        <div className="mt-2 h-3 w-20 rounded bg-fill-b" />
        <div className="h-3 w-32 rounded bg-fill-b" />
        <div className="h-3 w-24 rounded bg-fill-b" />
        <div className="h-3 w-28 rounded bg-fill-b" />
        <div className="h-3 w-16 rounded bg-fill-b" />
      </aside>
      <div className="flex flex-1 flex-col gap-4 p-8">
        <div className="h-12 w-12 rounded-lg bg-fill-b" />
        <div className="mt-2 h-7 w-2/3 rounded bg-hover" />
        <div className="h-3.5 w-full rounded bg-fill-b" />
        <div className="h-3.5 w-11/12 rounded bg-fill-b" />
        <div className="h-3.5 w-4/5 rounded bg-fill-b" />
        <div className="h-3.5 w-3/4 rounded bg-fill-b" />
      </div>
    </div>
  );
}
