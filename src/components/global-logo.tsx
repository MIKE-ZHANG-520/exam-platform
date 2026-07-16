/**
 * 全局 Logo · CZJR · 制作
 * 固定在页面右下角，滚动时保持可见
 * 具备闪光扫过效果 + 橙色发光圆点脉冲
 */
export function GlobalLogo() {
  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] pointer-events-none select-none md:bottom-4 md:right-4"
      aria-label="CZJR 制作"
    >
      <div
        className="
          relative flex items-center gap-2
          rounded-lg
          bg-gradient-to-b from-neutral-900 to-black
          border border-amber-400/70
          px-3 py-1.5
          shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(251,191,36,0.15)]
          overflow-hidden
        "
      >
        {/* 扫光层 · 从左到右循环 */}
        <span
          aria-hidden="true"
          className="
            pointer-events-none absolute inset-0
            bg-[linear-gradient(110deg,transparent_20%,rgba(255,213,128,0.28)_50%,transparent_80%)]
            bg-[length:200%_100%]
            animate-[czjr-shimmer_2.8s_linear_infinite]
          "
        />

        {/* 橙色发光圆点 · 呼吸脉冲 */}
        <span
          aria-hidden="true"
          className="
            relative z-10 inline-block h-1.5 w-1.5 rounded-full
            bg-orange-400
            shadow-[0_0_8px_2px_rgba(251,146,60,0.75)]
            animate-[czjr-pulse_1.6s_ease-in-out_infinite]
          "
        />

        {/* CZJR */}
        <span
          className="
            relative z-10
            text-[11px] md:text-xs
            font-bold tracking-[0.15em]
            text-white
            [text-shadow:0_0_6px_rgba(255,213,128,0.35)]
          "
        >
          CZJR
        </span>

        {/* 分隔圆点 */}
        <span
          aria-hidden="true"
          className="relative z-10 inline-block h-1 w-1 rounded-full bg-white/70"
        />

        {/* 制作 */}
        <span
          className="
            relative z-10
            text-[11px] md:text-xs
            font-semibold tracking-wider
            text-white
            [text-shadow:0_0_6px_rgba(255,213,128,0.35)]
          "
        >
          制作
        </span>
      </div>
    </div>
  );
}
