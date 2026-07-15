import { getSupabaseClient } from "@/storage/database/supabase-client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 返回一个懒加载的 Supabase 客户端代理。
 * 只有在首次访问属性/方法时才真正实例化底层客户端，
 * 避免在 Next.js `next build` 的 "Collecting page data" 阶段
 * （模块顶层 `const supabase = db()`）因缺少环境变量抛错。
 */
export function db(): SupabaseClient {
  let real: SupabaseClient | null = null;
  const getReal = (): SupabaseClient => {
    if (!real) real = getSupabaseClient();
    return real;
  };
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getReal() as unknown as Record<PropertyKey, unknown>;
      const value = client[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(client);
      }
      return value;
    },
  });
}

/** 从数组随机抽取 n 个（Fisher-Yates 洗牌前 n 位）。 */
export function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  const size = Math.min(n, copy.length);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
