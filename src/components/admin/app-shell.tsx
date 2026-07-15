"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
	BarChart3,
	BookOpen,
	FileText,
	GraduationCap,
	LayoutDashboard,
	LogOut,
	NotebookPen,
	Users,
	ChevronDown,
} from "lucide-react"
import { toast } from "sonner"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Me {
	id: string
	username: string
	real_name: string
	role: "admin" | "user"
	department?: string | null
	avatar_color?: string | null
}

interface NavItem {
	href: string
	label: string
	icon: React.ComponentType<{ className?: string }>
	adminOnly?: boolean
}

const NAV: NavItem[] = [
	{ href: "/admin/dashboard", label: "数据看板", icon: LayoutDashboard },
	{ href: "/admin/materials", label: "培训材料", icon: FileText },
	{ href: "/admin/banks", label: "题库管理", icon: NotebookPen },
	{ href: "/admin/exams", label: "考试试卷", icon: BookOpen },
	{ href: "/admin/records", label: "考试记录", icon: BarChart3 },
	{ href: "/admin/users", label: "用户管理", icon: Users, adminOnly: true },
]

function initials(name: string) {
	if (!name) return "?"
	return name.slice(0, 1).toUpperCase()
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname()
	const router = useRouter()
	const [me, setMe] = useState<Me | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.json())
			.then((d) => {
				setMe(d.user)
				setLoading(false)
			})
			.catch(() => setLoading(false))
	}, [])

	const logout = async () => {
		await fetch("/api/auth/logout", { method: "POST" })
		toast.success("已退出登录")
		router.push("/login")
	}

	const visibleNav = NAV.filter((n) => !n.adminOnly || me?.role === "admin")

	return (
		<div className="min-h-screen flex bg-[#f5f7fa]">
			{/* 侧边栏 */}
			<aside className="w-[240px] shrink-0 brand-sidebar-gradient text-white flex flex-col relative">
				<div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]" />
				<div className="relative px-5 pt-6 pb-5 border-b border-white/10">
					<div className="flex items-center gap-2.5">
						<div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner">
							<GraduationCap className="w-5 h-5" />
						</div>
						<div>
							<div className="text-[15px] font-semibold leading-tight">智慧培训考试</div>
							<div className="text-[11px] text-white/70 tracking-wide">Smart Training Platform</div>
						</div>
					</div>
				</div>

				<nav className="relative flex-1 px-3 py-4 space-y-1 overflow-y-auto">
					{visibleNav.map((it) => {
						const active = pathname === it.href || pathname.startsWith(it.href + "/")
						const Icon = it.icon
						return (
							<Link
								key={it.href}
								href={it.href}
								className={[
									"group relative flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-all duration-200",
									active
										? "bg-white/18 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
										: "text-white/80 hover:bg-white/10 hover:text-white",
								].join(" ")}
							>
								{active && (
									<span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r bg-[#4096ff]" />
								)}
								<Icon className={active ? "w-4 h-4" : "w-4 h-4 opacity-80 group-hover:opacity-100"} />
								<span className="tracking-wide">{it.label}</span>
							</Link>
						)
					})}
				</nav>

				<div className="relative px-4 py-4 border-t border-white/10 text-[11px] text-white/60 leading-relaxed">
					<div>© {new Date().getFullYear()} Smart Training</div>
					<div>v1.1 · AI Powered</div>
				</div>
			</aside>

			{/* 主区域 */}
			<div className="flex-1 flex flex-col min-w-0">
				<header className="h-14 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200 flex items-center justify-between px-6">
					<div className="text-sm text-gray-500">
						{pathname === "/admin/dashboard" && "数据看板"}
						{pathname.startsWith("/admin/materials") && "培训材料"}
						{pathname.startsWith("/admin/banks") && "题库管理"}
						{pathname.startsWith("/admin/exams") && "考试试卷"}
						{pathname.startsWith("/admin/records") && "考试记录"}
						{pathname.startsWith("/admin/users") && "用户管理"}
					</div>
					{me && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-gray-100 transition">
									<div
										className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shadow"
										style={{ background: me.avatar_color || "#1677ff" }}
									>
										{initials(me.real_name || me.username)}
									</div>
									<div className="text-left leading-tight hidden sm:block">
										<div className="text-sm text-gray-900 font-medium">{me.real_name}</div>
										<div className="text-[11px] text-gray-500">
											{me.role === "admin" ? "超级管理员" : "普通管理员"}
											{me.department ? ` · ${me.department}` : ""}
										</div>
									</div>
									<ChevronDown className="w-4 h-4 text-gray-400" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuLabel>
									<div className="flex items-center gap-2">
										<div
											className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
											style={{ background: me.avatar_color || "#1677ff" }}
										>
											{initials(me.real_name || me.username)}
										</div>
										<div>
											<div className="text-sm">{me.real_name}</div>
											<div className="text-[11px] text-gray-500">{me.username}</div>
										</div>
									</div>
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
									<LogOut className="w-4 h-4 mr-2" />
									退出登录
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
					{loading && <div className="skeleton h-8 w-40 rounded-lg" />}
				</header>

				<main className="flex-1 min-w-0 p-6 md:p-8">
					<div className="mx-auto max-w-[1440px]">
						{children}
					</div>
				</main>
			</div>
		</div>
	)
}
