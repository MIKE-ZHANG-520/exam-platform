import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "在线考试",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F5F7FB]">{children}</div>;
}
