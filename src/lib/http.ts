// 前端 fetch 封装
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET", headers: { "cache-control": "no-store" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`);
  return data as T;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    headers: isForm ? undefined : { "content-type": "application/json" },
    body: isForm ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`);
  return data as T;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`);
  return data as T;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`);
  return data as T;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return s;
  }
}

export function fmtDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return "-";
  const n = Number(sec) || 0;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}
