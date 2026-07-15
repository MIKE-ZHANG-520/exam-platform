"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiGet, fmtDate } from "@/lib/http"
import { toast } from "sonner"
import { ListTree, ArrowRight, Search, BookOpen, CheckCircle2, Pencil, Filter } from "lucide-react"

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
			<div>
				<h1 className="text-[22px] font-semibold text-gray-900">题库管理</h1>
				<p className="text-sm text-gray-500 mt-0.5">审核编辑 AI 生成的题库，发布后即可用于组卷</p>
			</div>

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
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="skeleton h-40 rounded-xl" />
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
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{filtered.map((b) => {
						const published = (b.status || "draft") === "published"
						return (
							<Card key={b.id} className="brand-card border-0 hover-lift">
								<CardContent className="p-5">
									<div className="flex items-start gap-3">
										<div
											className={[
												"w-11 h-11 rounded-xl flex items-center justify-center",
												b.difficulty === "easy"
													? "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600"
													: "bg-gradient-to-br from-blue-50 to-blue-100 text-[#1677ff]",
											].join(" ")}
										>
											<ListTree className="w-5 h-5" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-2">
												<div className="text-[14px] font-semibold text-gray-900 line-clamp-1">{b.title}</div>
												<Badge
													variant="outline"
													className={
														published
															? "bg-emerald-50 text-emerald-700 border-emerald-200"
															: "bg-orange-50 text-orange-700 border-orange-200"
													}
												>
													{published ? (
														<>
															<CheckCircle2 className="w-3 h-3 mr-1" />
															已发布
														</>
													) : (
														<>
															<Pencil className="w-3 h-3 mr-1" />
															待审
														</>
													)}
												</Badge>
											</div>
											<div className="text-[11px] text-gray-500 mt-1">
												{b.difficulty === "easy" ? "简易题库" : "中等题库"} · 创建于 {fmtDate(b.created_at)}
											</div>
										</div>
									</div>

									<div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
										<span className="text-xs text-gray-500">题目总数</span>
										<span className="text-[18px] font-semibold text-gray-900 tabular-nums">{b.total_count}</span>
									</div>

									<Link href={`/admin/banks/${b.id}`}>
										<Button variant="outline" size="sm" className="w-full mt-3 hover:border-[#1677ff] hover:text-[#1677ff]">
											查看题目 <ArrowRight className="ml-auto h-3 w-3" />
										</Button>
									</Link>
								</CardContent>
							</Card>
						)
					})}
				</div>
			)}
		</div>
	)
}
