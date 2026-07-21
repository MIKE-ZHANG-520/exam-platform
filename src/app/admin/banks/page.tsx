"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiGet, fmtDate } from "@/lib/http"
import { toast } from "sonner"
import { ListTree, ArrowRight, Search, BookOpen, Filter } from "lucide-react"
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
			<div className="brand-card rounded-xl p-4 flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2 text-gray-500 text-sm">
					<Filter className="w-4 h-4" /> 筛选
				</div>
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
					<Input
						value={kw}
						onChange={(e) => setKw(e.target.value)}
						placeholder="搜索题库名称"
						className="pl-9 h-9"
					/>
				</div>
				<div className="flex items-center gap-1 rounded-lg bg-gray-50 p-1">
					{(["all", "draft", "published"] as const).map((s) => (
						<button
							key={s}
							onClick={() => setStatus(s)}
							className={[
								"px-3 h-7 rounded-md text-xs transition",
								status === s ? "bg-white text-[#1677ff] shadow-sm" : "text-gray-500 hover:text-gray-800",
							].join(" ")}
						>
							{s === "all" ? "全部" : s === "draft" ? "待审" : "已发布"}
						</button>
					))}
				</div>
				<div className="ml-auto text-xs text-gray-400">共 {filtered.length} 个题库</div>
			</div>

			{loading ? (
				<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
					{Array.from({ length: 8 }).map((_, i) => (
						<div key={i} className="skeleton h-28 rounded-lg" />
					))}
				</div>
			) : filtered.length === 0 ? (
				<div className="brand-card rounded-xl py-16 flex flex-col items-center">
					<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3">
						<BookOpen className="w-7 h-7 text-[#1677ff]" />
					</div>
					<div className="text-[15px] font-medium text-gray-800">还没有匹配的题库</div>
					<div className="text-sm text-gray-500 mt-1">上传材料后在详情页可 AI 一键生成</div>
					<Link href="/admin/materials" className="mt-4">
						<Button className="bg-[#1677ff] hover:bg-[#0958d9]">前往材料管理</Button>
					</Link>
				</div>
			) : (
				<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
					{filtered.map((b) => {
						const published = (b.status || "draft") === "published"
						return (
							<Card key={b.id} className="brand-card border-0 hover-lift group">
								<CardContent className="p-3.5">
									{/* 顶部：状态 + 难度 */}
									<div className="flex items-center justify-between mb-2">
										<span
											className={[
												"text-[10px] font-medium px-1.5 py-0.5 rounded",
												b.difficulty === "easy"
													? "bg-emerald-50 text-emerald-600"
													: "bg-blue-50 text-[#1677ff]",
											].join(" ")}
										>
											{b.difficulty === "easy" ? "简易" : "中等"}
										</span>
										<span
											className={[
												"text-[10px] px-1.5 py-0.5 rounded",
												published
													? "bg-emerald-50 text-emerald-600"
													: "bg-orange-50 text-orange-600",
											].join(" ")}
										>
											{published ? "已发布" : "待审"}
										</span>
									</div>

									{/* 标题 */}
									<div className="text-[13px] font-medium text-gray-900 line-clamp-2 leading-snug mb-2 min-h-[2.5em]">
										{b.title}
									</div>

									{/* 题目数量 */}
									<div className="flex items-center gap-1 text-[11px] text-gray-500 mb-2.5">
										<ListTree className="w-3 h-3" />
										<span className="tabular-nums font-medium text-gray-700">{b.total_count}</span>
										<span>题</span>
									</div>

									{/* 底部：时间 + 操作 */}
									<div className="flex items-center justify-between pt-2 border-t border-gray-100">
										<span className="text-[10px] text-gray-400">{fmtDate(b.created_at)}</span>
										<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
											<Link href={`/admin/banks/${b.id}`}>
												<button className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-[#1677ff] transition-colors" title="查看题目">
													<ArrowRight className="w-3.5 h-3.5" />
												</button>
											</Link>
										</div>
									</div>
								</CardContent>
							</Card>
						)
					})}
				</div>
			)}
		</div>
	)
}
