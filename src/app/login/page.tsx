"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { GraduationCap, Loader2, Lock, ShieldCheck, User } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

export default function LoginPage() {
	const router = useRouter()
	const sp = useSearchParams()
	const [username, setUsername] = useState("admin")
	const [password, setPassword] = useState("admin123")
	const [remember, setRemember] = useState(true)
	const [loading, setLoading] = useState(false)

	const submit = async () => {
		if (!username || !password) {
			toast.error("请填写账号和密码")
			return
		}
		setLoading(true)
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password, remember }),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data?.error || "登录失败")
			toast.success(`欢迎回来，${data.user.real_name}`)
			const from = sp.get("from")
			router.replace(from && from.startsWith("/admin") ? from : "/admin/dashboard")
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#f5f7fa]">
			{/* 装饰背景 */}
			<div className="absolute inset-0 pointer-events-none">
				<div className="absolute top-[-120px] left-[-120px] w-[420px] h-[420px] rounded-full bg-[#1677ff] opacity-15 blur-3xl" />
				<div className="absolute bottom-[-120px] right-[-120px] w-[420px] h-[420px] rounded-full bg-[#0958d9] opacity-15 blur-3xl" />
				<div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(22,119,255,0.04),rgba(255,255,255,0)_60%)]" />
			</div>

			<div className="relative z-10 w-full max-w-[960px] mx-4 grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)] border border-white/60">
				{/* 左侧品牌区 */}
				<div className="hidden md:flex flex-col justify-between p-10 brand-header-gradient text-white relative">
					<div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_50%)]" />
					<div className="relative">
						<div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur">
							<GraduationCap className="w-5 h-5" />
							<span className="text-sm">Smart Training Platform</span>
						</div>
						<h1 className="mt-8 text-3xl font-bold leading-tight">
							智慧培训考试平台
						</h1>
						<p className="mt-3 text-white/85 text-sm leading-relaxed max-w-xs">
							AI 生成培训提纲与题库，扫码考试、即时评分、班组洞察，让企业安全培训看得见、抓得住。
						</p>
					</div>
					<div className="relative space-y-3 text-sm text-white/85">
						<div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> 两级权限管控，数据分部门隔离</div>
						<div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> 试卷快照 + 身份证加密，安全合规</div>
						<div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> AI 生成 + 人工审核，双重把关</div>
					</div>
				</div>

				{/* 右侧登录表单 */}
				<div className="p-8 md:p-10">
					<div className="mb-6">
						<div className="inline-flex items-center gap-2 text-[#1677ff]">
							<div className="w-9 h-9 rounded-lg brand-header-gradient flex items-center justify-center">
								<GraduationCap className="w-5 h-5 text-white" />
							</div>
							<span className="text-lg font-semibold text-gray-900">欢迎登录</span>
						</div>
						<p className="mt-2 text-sm text-gray-500">请使用工作账号进入管理后台</p>
					</div>

					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="username" className="text-sm">账号</Label>
							<div className="relative">
								<User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
								<Input
									id="username"
									className="pl-9 h-10 brand-input"
									placeholder="请输入账号"
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && submit()}
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="password" className="text-sm">密码</Label>
							<div className="relative">
								<Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
								<Input
									id="password"
									type="password"
									className="pl-9 h-10 brand-input"
									placeholder="请输入密码"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && submit()}
								/>
							</div>
						</div>
						<div className="flex items-center justify-between">
							<label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
								<Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
								记住密码
							</label>
							<span className="text-xs text-gray-400">忘记密码请联系管理员</span>
						</div>
						<Button
							className="w-full h-10 bg-[#1677ff] hover:bg-[#0958d9] shadow-[0_6px_20px_rgba(22,119,255,0.35)]"
							onClick={submit}
							disabled={loading}
						>
							{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />登录中...</> : "登 录"}
						</Button>

						<div className="mt-6 rounded-lg bg-[#f5f7fa] border border-dashed border-gray-200 p-3 text-xs text-gray-500 leading-relaxed">
							<div className="text-gray-600 font-medium mb-1">演示账号</div>
							<div>超级管理员：<span className="font-mono">admin / admin123</span></div>
							<div>普通管理员：<span className="font-mono">trainer / trainer123</span></div>
						</div>
					</div>
				</div>
			</div>

			<p className="absolute bottom-4 text-xs text-gray-400 z-10">
				© {new Date().getFullYear()} 智慧培训考试平台 · Powered by AI
			</p>
		</div>
	)
}
