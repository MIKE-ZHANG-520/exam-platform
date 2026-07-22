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
	Bell,
	Home,
	ChevronRight,
	ShieldCheck,
	KeyRound,
	Loader2,
	Eye,
	EyeOff,
	FolderKanban,
	Users2,
	UserSquare2,
	Menu,
	X,
	Shield,
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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface Me {
	id: string
	username: string
	real_name: string
	role: "admin" | "trainer" | "user"
	department?: string | null
	avatar_color?: string | null
}

interface NavItem {
	href: string
	label: string
	icon: React.ComponentType<{ className?: string }>
	adminOnly?: boolean // 仅 admin 可见
	trainerHidden?: boolean // trainer 不可见（user 和 trainer 都看不到）
	group?: string
}

const NAV: NavItem[] = [
	{ href: "/admin/dashboard", label: "数据看板", icon: LayoutDashboard, group: "总览" },
	{ href: "/admin/projects", label: "项目管理", icon: FolderKanban, group: "组织架构", adminOnly: true },
	{ href: "/admin/teams", label: "班组管理", icon: Users2, group: "组织架构", adminOnly: true },
	{ href: "/admin/workers", label: "花名册", icon: UserSquare2, group: "组织架构", adminOnly: true },
	{ href: "/admin/safety", label: "工人安全管理", icon: Shield, group: "组织架构" },
	{ href: "/admin/materials", label: "培训材料", icon: FileText, group: "培训业务" },
	{ href: "/admin/banks", label: "题库管理", icon: NotebookPen, group: "培训业务" },
	{ href: "/admin/exams", label: "考试试卷", icon: BookOpen, group: "培训业务" },
	{ href: "/admin/records", label: "考试记录", icon: BarChart3, group: "培训业务" },
	{ href: "/admin/users", label: "用户管理", icon: Users, adminOnly: true, group: "系统" },
]

function initials(name: string) {
	if (!name) return "?"
	return name.slice(0, 1).toUpperCase()
}

function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
	const crumbs: { label: string; href?: string }[] = [
		{ label: "首页", href: "/admin/dashboard" },
	]
	if (pathname === "/admin/dashboard") crumbs.push({ label: "数据看板" })
	else if (pathname.startsWith("/admin/projects")) crumbs.push({ label: "项目管理" })
	else if (pathname.startsWith("/admin/teams")) crumbs.push({ label: "班组管理" })
	else if (pathname.startsWith("/admin/workers")) {
		if (pathname === "/admin/workers") crumbs.push({ label: "花名册" })
		else crumbs.push({ label: "花名册", href: "/admin/workers" }, { label: "工人详情" })
	}
	else if (pathname.startsWith("/admin/safety")) {
		if (pathname === "/admin/safety") crumbs.push({ label: "工人安全管理" })
		else crumbs.push({ label: "工人安全管理", href: "/admin/safety" }, { label: "工人档案" })
	}
	else if (pathname.startsWith("/admin/materials")) {
		crumbs.push({ label: "培训材料", href: "/admin/materials" })
		if (pathname !== "/admin/materials") crumbs.push({ label: "材料详情" })
	} else if (pathname.startsWith("/admin/banks")) {
		crumbs.push({ label: "题库管理", href: "/admin/banks" })
		if (pathname !== "/admin/banks") crumbs.push({ label: "题库详情" })
	} else if (pathname.startsWith("/admin/exams")) {
		crumbs.push({ label: "考试试卷", href: "/admin/exams" })
	} else if (pathname.startsWith("/admin/records")) {
		crumbs.push({ label: "考试记录", href: "/admin/records" })
		if (pathname !== "/admin/records") crumbs.push({ label: "记录详情" })
	} else if (pathname.startsWith("/admin/users")) {
		crumbs.push({ label: "用户管理" })
	}
	return crumbs
}

export function AppShell({ children, user }: { children: React.ReactNode; user?: Me | null }) {
	const pathname = usePathname()
	const router = useRouter()
	const [me, setMe] = useState<Me | null>(user ?? null)
	const [loading, setLoading] = useState(!user)
	const [pwdOpen, setPwdOpen] = useState(false)
	const [pwdForm, setPwdForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" })
	const [pwdSaving, setPwdSaving] = useState(false)
	const [showOld, setShowOld] = useState(false)
	const [showNew, setShowNew] = useState(false)

	useEffect(() => {
		if (user) return
		fetch("/api/auth/me")
			.then((r) => r.json())
			.then((d) => {
				setMe(d.user)
				setLoading(false)
			})
			.catch(() => setLoading(false))
	}, [user])

	const logout = async () => {
		await fetch("/api/auth/logout", { method: "POST" })
		toast.success("已退出登录")
		router.push("/login")
	}

	const openPwdDialog = () => {
		setPwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" })
		setShowOld(false)
		setShowNew(false)
		setPwdOpen(true)
	}

	const onChangePassword = async () => {
		const { oldPassword, newPassword, confirmPassword } = pwdForm
		if (!oldPassword || !newPassword) return toast.error("请填写原密码和新密码")
		if (newPassword.length < 6) return toast.error("新密码至少6位")
		if (newPassword !== confirmPassword) return toast.error("两次输入的新密码不一致")
		setPwdSaving(true)
		try {
			const res = await fetch("/api/auth/change-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ oldPassword, newPassword }),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || "修改失败")
			toast.success("密码修改成功")
			setPwdOpen(false)
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setPwdSaving(false)
		}
	}

	const visibleNav = NAV.filter((n) => {
		if (!n.adminOnly) return true // 所有用户可见
		if (me?.role === "admin") return true // admin 可见所有
		if (me?.role === "trainer" && !["/admin/users", "/admin/projects", "/admin/teams", "/admin/workers"].includes(n.href)) return true // trainer 可见培训业务
		return false
	})
	const breadcrumbs = getBreadcrumbs(pathname)
	const [mobileNavOpen, setMobileNavOpen] = useState(false)
	useEffect(() => { setMobileNavOpen(false) }, [pathname])

	// 分组渲染
	const grouped: Array<{ group: string; items: NavItem[] }> = []
	for (const it of visibleNav) {
		const g = it.group ?? "其他"
		let bucket = grouped.find((x) => x.group === g)
		if (!bucket) {
			bucket = { group: g, items: [] }
			grouped.push(bucket)
		}
		bucket.items.push(it)
	}

	return (
		<>
		<div className="min-h-screen flex bg-[#f5f7fa]">
			{/* 移动端遮罩 */}
			{mobileNavOpen && (
				<div
					className="fixed inset-0 bg-black/40 z-40 md:hidden"
					onClick={() => setMobileNavOpen(false)}
				/>
			)}
			{/* 侧边栏 */}
			<aside
				className={[
					"w-[240px] shrink-0 brand-sidebar-gradient text-white flex flex-col relative overflow-y-auto",
					"md:sticky md:top-0 md:h-screen",
					"fixed inset-y-0 left-0 z-50 h-screen transition-transform duration-200 md:translate-x-0",
					mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
				].join(" ")}
			>
				<div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]" />
				<div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_bottom_right,rgba(64,150,255,0.6),transparent_70%)]" />
				<div className="relative px-5 pt-6 pb-5 border-b border-white/10 flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner">
							<GraduationCap className="w-5 h-5" />
						</div>
						<div>
							<div className="text-[15px] font-semibold leading-tight">智慧培训考试</div>
							<div className="text-[11px] text-white/70 tracking-wide">Smart Training Platform</div>
						</div>
					</div>
					<button
						onClick={() => setMobileNavOpen(false)}
						className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/10"
						aria-label="关闭菜单"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<nav className="relative flex-1 px-3 py-4 space-y-4 overflow-y-auto">
					{grouped.map((g) => (
						<div key={g.group} className="space-y-1">
							<div className="px-3 pt-1 text-[10px] uppercase tracking-widest text-white/40">{g.group}</div>
							{g.items.map((it) => {
								const active = pathname === it.href || pathname.startsWith(it.href + "/")
								const Icon = it.icon
								return (
									<Link
										key={it.href}
										href={it.href}
										className={[
											"group relative flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-all duration-200",
											active
												? "bg-gradient-to-r from-white/20 to-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
												: "text-white/75 hover:bg-white/10 hover:text-white",
										].join(" ")}
									>
										{active && (
											<span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-gradient-to-b from-[#4096ff] to-[#82b6ff] shadow-[0_0_8px_rgba(64,150,255,0.6)]" />
										)}
										<Icon className={active ? "w-[18px] h-[18px]" : "w-[18px] h-[18px] opacity-70 group-hover:opacity-100"} />
										<span className="tracking-wide">{it.label}</span>
									</Link>
								)
							})}
						</div>
					))}
				</nav>

				<div className="relative px-4 py-4 border-t border-white/10 text-[11px] text-white/60 leading-relaxed">
					<div className="flex items-center gap-1.5">
						<ShieldCheck className="w-3 h-3" />
						<span>© {new Date().getFullYear()} Smart Training</span>
					</div>
					<div className="mt-0.5">v3.0 · 才子佳人 Powered</div>
				</div>
			</aside>

			{/* 主区域 */}
			<div className="flex-1 flex flex-col min-w-0">
				<header className="h-14 sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
					{/* 面包屑 */}
					<div className="flex items-center gap-2 min-w-0">
						<button
							onClick={() => setMobileNavOpen(true)}
							className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
							aria-label="打开菜单"
						>
							<Menu className="w-5 h-5" />
						</button>
						<div className="flex items-center gap-1.5 text-sm overflow-x-auto no-scrollbar">
							{breadcrumbs.map((c, i) => (
								<span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
									{i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
									{i === 0 && <Home className="w-3.5 h-3.5 text-gray-400" />}
									{c.href ? (
										<Link href={c.href} className="text-gray-500 hover:text-[#1677ff] transition-colors">
											{c.label}
										</Link>
									) : (
										<span className={i === breadcrumbs.length - 1 ? "text-gray-900 font-medium" : "text-gray-500"}>
											{c.label}
										</span>
									)}
								</span>
							))}
						</div>
					</div>

					<div className="flex items-center gap-3">
						{/* 消息提示铃铛 */}
						<button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
							<Bell className="w-[18px] h-[18px]" />
							<span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ef4444] ring-2 ring-white" />
						</button>

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
									<DropdownMenuItem onClick={openPwdDialog} className="cursor-pointer">
										<KeyRound className="w-4 h-4 mr-2" />
										修改密码
									</DropdownMenuItem>
									<DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
										<LogOut className="w-4 h-4 mr-2" />
										退出登录
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{loading && <div className="skeleton h-8 w-40 rounded-lg" />}
					</div>
				</header>

					<main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">
						<div className="mx-auto max-w-[1440px] animate-fade-in-up">
							{children}
						</div>
					</main>
			</div>
		</div>
	{/* 修改密码弹窗 */}
	<Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
		<DialogContent className="sm:max-w-[400px]">
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					<KeyRound className="h-5 w-5 text-primary" />
					修改密码
				</DialogTitle>
			</DialogHeader>
			<div className="space-y-4 py-2">
				<div className="space-y-1.5">
					<Label htmlFor="old-pwd">原密码 <span className="text-destructive">*</span></Label>
					<div className="relative">
						<Input
							id="old-pwd"
							type={showOld ? "text" : "password"}
							placeholder="请输入当前密码"
							value={pwdForm.oldPassword}
							onChange={(e) => setPwdForm((p) => ({ ...p, oldPassword: e.target.value }))}
							className="pr-10"
						/>
						<button
							type="button"
							onClick={() => setShowOld((v) => !v)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						>
							{showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</button>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="new-pwd">新密码 <span className="text-destructive">*</span></Label>
					<div className="relative">
						<Input
							id="new-pwd"
							type={showNew ? "text" : "password"}
							placeholder="至少6位"
							value={pwdForm.newPassword}
							onChange={(e) => setPwdForm((p) => ({ ...p, newPassword: e.target.value }))}
							className="pr-10"
						/>
						<button
							type="button"
							onClick={() => setShowNew((v) => !v)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						>
							{showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</button>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="confirm-pwd">确认新密码 <span className="text-destructive">*</span></Label>
					<Input
						id="confirm-pwd"
						type={showNew ? "text" : "password"}
						placeholder="再次输入新密码"
						value={pwdForm.confirmPassword}
						onChange={(e) => setPwdForm((p) => ({ ...p, confirmPassword: e.target.value }))}
					/>
				</div>
			</div>
			<DialogFooter>
				<Button variant="outline" onClick={() => setPwdOpen(false)} disabled={pwdSaving}>
					取消
				</Button>
				<Button onClick={onChangePassword} disabled={pwdSaving}>
					{pwdSaving ? (
						<>
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							提交中...
						</>
					) : (
						"确认修改"
					)}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
	</>
	)
}
