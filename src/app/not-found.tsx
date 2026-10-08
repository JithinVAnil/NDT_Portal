import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">404</p>
      <h1 className="text-xl font-semibold text-navy-900">Page not found</h1>
      <p className="text-[13px] text-muted">The page you requested does not exist in this prototype.</p>
      <Link href="/" className="mt-2 text-[13px] text-brand-600 hover:underline">Return to your dashboard</Link>
    </div>
  );
}
