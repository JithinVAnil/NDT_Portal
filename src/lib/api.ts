/**
 * Thin fetch wrapper for the FastAPI backend.
 * Requests go to same-origin /api/* (proxied by Next.js rewrites), so no CORS is needed in the browser.
 */
const TOKEN_KEY = "nielit_demo_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session will not persist across reloads */
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Query): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return body.detail.map((d: { msg?: string }) => d.msg).join("; ");
  } catch {
    /* ignore */
  }
  if (res.status === 403) return "You do not have permission to perform this action.";
  if (res.status === 404) return "The requested record was not found.";
  if (res.status >= 500) return "The server could not complete the request. Please try again.";
  return `Request failed (${res.status})`;
}

function onUnauthorized() {
  setToken(null);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login?expired=1";
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; form?: FormData; base?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${opts.base ?? ""}/api${path}${qs(opts.query)}`, {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the portal API. Check that the backend is running on port 8000.");
  }
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    onUnauthorized();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download a file (CSV/XLSX/PDF) produced by the backend. */
export async function download(path: string, query?: Query, fallbackName = "download") {
  const token = getToken();
  const res = await fetch(`/api${path}${qs(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, "Session expired");
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const name = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

/** Large uploads (videos) go straight to the backend to avoid proxy body limits. */
export function uploadBase(): string {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_UPLOAD_BASE;
  if (env) return env;
  return window.location.port === "3000" ? `${window.location.protocol}//${window.location.hostname}:8000` : "";
}
