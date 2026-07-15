import { getSupabaseClient } from "@/storage/database/supabase-client";

export function db() {
  return getSupabaseClient();
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
