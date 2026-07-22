"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { apiGet, fmtDate } from "@/lib/http"
import { toast } from "sonner"
import {
	BookOpen,
	Search,
	Filter,
	ArrowRight,
	Eye,
	ListTree,
	Calendar,
	BarChart3,
	GraduationCap,
} from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"

interface Bank {
	id: string
	material_id: string | null
	title: string
	difficulty: "easy" | "medium"
	total_count: number
	status?: "draft" | "published"
	created_at: string
}

export default function BanksPage() {
	const [items, setItems] = useState<Bank[]>([])
	const [loading, setLoading] = useState(true)
	const [kw, setKw] = useState("")
	const [status, setStatus] = useState<"all" | "draft" | "published">("all")

	const load = useCallback(() => {
		setLoading(true)
		apiGet<{ items: Bank[] }>("/api/banks")
			.then((r) => setItems(r.items))
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const filtered = items.filter((b) => {
		if (status !== "all" && (b.status || "draft") !== status) return false
		if (kw && !b.title.toLowerCase().includes(kw.toLowerCase())) return false
		return true
	})

	return (
		<div className="space-y-6">
			<PageHeader title="题库管理" description="审核编辑 AI 生成的题库，发布后即可用于组卷" />

			{/* 筛选区 */}
			<div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-sm border border-gray-100">
				<div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
					<Filter className="w-4 h-4" /> 筛选
				</div>
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
					<Input
						value={kw}
						onChange={(e) => setKw(e.target.value)}
						placeholder="搜索题库名称"
						className="pl-9 h-9 bg-gray-50 border-gray-200 focus:bg-white"
					/>
				</div>
				<div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
					{(["all", "draft", "published"] as const).map((s) => (
						<button
							key={s}
							onClick={() => setStatus(s)}
							className={[
								"px-3 h-7 rounded-md text-xs font-medium transition-all",
								status === s ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-800",
							].join(" ")}
						>
							{s === "all" ? "全部" : s === "draft" ? "待审" : "已发布"}
						</button>
					))}
				</div>
				<div className="ml-auto text-xs text-gray-400">共 {filtered.length} 个题库</div>
			</div>

			{/* 表格 */}
			{loading ? (
				<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
					<div className="p-8 space-y-4">
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className="skeleton h-12 rounded-lg" />
						))}
					</div>
				</div>
			) : filtered.length === 0 ? (
				<div className="bg-white rounded-xl py-16 flex flex-col items-center shadow-sm border border-gray-100">
					<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3 shadow-inner">
						<BookOpen className="w-7 h-7 text-blue-500" />
					</div>
					<div className="text-base font-semibold text-gray-800">还没有匹配的题库</div>
					<div className="text-sm text-gray-500 mt-1">上传材料后在详情页可 AI 一键生成</div>
					<Link href="/admin/materials" className="mt-4">
						<Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30">
							前往材料管理
						</Button>
					</Link>
				</div>
			) : (
				<div className="bg-white rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
					{/* 表头 */}
					<div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
						<div className="grid grid-cols-[1fr_100px_100px_100px_120px_140px] gap-4 px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
							<div>题库名称</div>
							<div>难度</div>
							<div>题目数</div>
							<div>状态</div>
							<div>创建时间</div>
							<div className="text-right">操作</div>
						</div>
					</div>

					{/* 表体 */}
					<div className="divide-y divide-gray-100">
						{filtered.map((b) => {
							const published = (b.status || "draft") === "published"
							return (
								<div
									key={b.id}
									className="grid grid-cols-[1fr_100px_100px_100px_120px_140px] gap-4 px-6 py-4 items-center hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-all duration-200 group"
								>
									{/* 名称 */}
									<div className="flex items-center gap-3 min-w-0">
										<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center shrink-0 shadow-sm border border-blue-100">
											<ListTree className="w-5 h-5 text-blue-600" />
										</div>
										<div className="min-w-0">
											<div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
												{b.title}
											</div>
											<div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
												<BarChart3 className="w-3 h-3" />
												{b.total_count} 道题目
											</div>
										</div>
									</div>

									{/* 难度 */}
									<div>
										<Badge
											className={
												b.difficulty === "easy"
													? "bg-emerald-50 text-emerald-700 border-emerald-200"
													: "bg-blue-50 text-blue-700 border-blue-200"
											}
										>
											<GraduationCap className="w-3 h-3 mr-1" />
											{b.difficulty === "easy" ? "简易" : "中等"}
										</Badge>
									</div>

									{/* 题目数 */}
									<div className="text-sm font-semibold text-gray-900 tabular-nums">
										{b.total_count}
										<span className="text-gray-400 font-normal ml-1">题</span>
									</div>

									{/* 状态 */}
									<div>
										<Badge
											className={
												published
													? "bg-emerald-50 text-emerald-700 border-emerald-200"
													: "bg-amber-50 text-amber-700 border-amber-200"
											}
										>
											{published ? "已发布" : "待审"}
										</Badge>
									</div>

									{/* 时间 */}
									<div className="text-sm text-gray-500 flex items-center gap-1.5">
										<Calendar className="w-3.5 h-3.5 text-gray-400" />
										{fmtDate(b.created_at)}
									</div>

									{/* 操作 */}
									<div className="flex items-center justify-end gap-2">
										<Link href={`/admin/banks/${b.id}`}>
											<Button
												size="sm"
												className="h-8 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 transition-all hover:-translate-y-0.5"
											>
												<Eye className="w-3.5 h-3.5 mr-1" />
												查看题目
												<ArrowRight className="w-3.5 h-3.5 ml-1" />
											</Button>
										</Link>
									</div>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
