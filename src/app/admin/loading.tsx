export default function AdminLoading() {
  return (
    <div className="flex h-screen w-full animate-pulse bg-slate-950">
      <div className="w-64 shrink-0 border-r border-slate-800 bg-slate-900 p-4 flex flex-col gap-4">
        <div className="h-10 rounded-lg bg-slate-800" />
        <div className="h-4 w-3/4 rounded bg-slate-800" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded-md bg-slate-800" />
          ))}
        </div>
        <div className="mt-auto h-12 rounded-lg bg-slate-800" />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="h-14 shrink-0 border-b border-slate-800 bg-slate-900 px-6 flex items-center gap-4">
          <div className="h-5 w-40 rounded bg-slate-800" />
          <div className="ml-auto h-8 w-8 rounded-full bg-slate-800" />
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-800/60" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-64 rounded-xl bg-slate-800/60" />
            <div className="h-64 rounded-xl bg-slate-800/60" />
          </div>
          <div className="h-56 rounded-xl bg-slate-800/60" />
        </div>
      </div>
    </div>
  );
}