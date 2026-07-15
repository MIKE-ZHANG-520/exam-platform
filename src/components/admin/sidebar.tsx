"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, ClipboardList, BookOpen, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "数据看板", icon: LayoutDashboard },
  { href: "/admin/materials", label: "培训材料", icon: FileText },
  { href: "/admin/banks", label: "题库管理", icon: BookOpen },
  { href: "/admin/exams", label: "试卷考试", icon: ClipboardList },
  { href: "/admin/records", label: "考试记录", icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-[#E4E7EC] bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-[#E4E7EC] px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1E5AA8] text-white text-lg font-bold">
          安
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#1F2937]">智慧培训考试</span>
          <span className="text-xs text-[#667085]">管理后台</span>
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-[#1E5AA8] text-white"
                  : "text-[#1F2937] hover:bg-[#F2F5FA]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
