"use client";

/**
 * CZJR-制作 品牌标识徽章
 * 矩形框 + 闪光扫过动效
 */
export function BrandBadge() {
  return (
    <div className="relative inline-flex items-center">
      <span
        className="relative inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium tracking-wide overflow-hidden"
        style={{ backdropFilter: "blur(4px)" }}
      >
        <span className="brand-badge-shimmer font-semibold">CZJR-制作</span>
        {/* 闪光扫过条 */}
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, transparent 35%, rgba(22,119,255,0.12) 48%, rgba(64,150,255,0.25) 50%, rgba(22,119,255,0.12) 52%, transparent 65%)",
            backgroundSize: "200% 100%",
            animation: "brandShimmer 3s linear infinite",
          }}
        />
      </span>
    </div>
  );
}
