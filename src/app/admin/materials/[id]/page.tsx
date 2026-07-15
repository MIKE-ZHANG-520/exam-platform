"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/http"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Sparkles, Pencil, Save, CheckCircle2, XCircle, ListTree } from "lucide-react"
import { OutlineRenderer } from "@/components/admin/outline-renderer"

interface Outline {
	id: string
	audience: "worker" | "trainer"
	content_md: string
	status: "draft" | "published"
	created_at: string
}

interface Bank {
	id: string
	title: string
	difficulty: "easy" | "medium"
	total_count: number
	status?: string
}

interface Material {
	id: string
	title: string
	file_name: string
	file_type: string
	status: string
}

interface Response {
	material: Material
	outlines: Outline[]
	banks: Bank[]
}

function OutlineCard({
	outline,
	audience,
	onRefresh,
	materialId,
}: {
	outline: Outline | undefined
	audience: "worker" | "trainer"
	onRefresh: () => void
	materialId: string
}) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(outline?.content_md || "")
	const [saving, setSaving] = useState(false)
	const [generating, setGenerating] = useState(false)

	useEffect(() => {
		setDraft(outline?.content_md || "")
	}, [outline?.content_md])

	const label = audience === "worker" ? "工人版" : "培训师版"

	const generate = async () => {
		setGenerating(true)
		try {
			await apiPost(`/api/materials/${materialId}/outline`, { audience })
			toast.success(`${label}提纲已生成（草稿），可预览编辑后发布`)
			onRefresh()
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setGenerating(false)
		}
	}

	const save = async () => {
		if (!outline) return
		setSaving(true)
		try {
			await apiPatch(`/api/outlines/${outline.id}`, { content_md: draft })
			toast.success("已保存")
			setEditing(false)
			onRefresh()
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setSaving(false)
		}
	}

	const publish = async () => {
		if (!outline) return
		try {
			await apiPatch(`/api/outlines/${outline.id}`, { status: "published" })
			toast.success("已发布")
			onRefresh()
		} catch (e) {
			toast.error((e as Error).message)
		}
	}

	const unpublish = async () => {
		if (!outline) return
		try {
			await apiPatch(`/api/outlines/${outline.id}`, { status: "draft" })
			toast.success("已改回草稿")
			onRefresh()
		} catch (e) {
			toast.error((e as Error).message)
		}
	}

	const remove = async () => {
		if (!outline) return
		if (!confirm(`确认删除 ${label} 提纲？删除后可重新生成。`)) return
		try {
			await apiDelete(`/api/outlines/${outline.id}`)
			toast.success("已删除")
			onRefresh()
		} catch (e) {
			toast.error((e as Error).message)
		}
	}

	if (!outline) {
		return (
			<div className="brand-card rounded-xl p-10 text-center">
				<div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] flex items-center justify-center">
					<Sparkles className="w-6 h-6 text-[#1677ff]" />
				</div>
				<div className="text-[15px] font-medium text-gray-800">暂无{label}提纲</div>
				<div className="text-sm text-gray-500 mt-1 mb-4">让 AI 基于材料内容为你生成一份高质量提纲</div>
				<Button className="bg-[#1677ff] hover:bg-[#0958d9]" onClick={generate} disabled={generating}>
					{generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
					AI 生成{label}提纲
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between flex-wrap gap-2">
				<div className="flex items-center gap-2">
					<Badge className={outline.status === "published" ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200"} variant="outline">
						{outline.status === "published" ? (
							<>
								<CheckCircle2 className="w-3 h-3 mr-1" />
								已发布
							</>
						) : (
							<>
								<Pencil className="w-3 h-3 mr-1" />
								草稿待审
							</>
						)}
					</Badge>
					<span className="text-xs text-gray-400">生成于 {new Date(outline.created_at).toLocaleString()}</span>
				</div>
				<div className="flex gap-2">
					{!editing && (
						<>
							<Button size="sm" variant="outline" onClick={() => setEditing(true)}>
								<Pencil className="w-3.5 h-3.5 mr-1" />
								编辑
							</Button>
							<Button size="sm" variant="outline" onClick={generate} disabled={generating}>
								{generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
								重新生成
							</Button>
							{outline.status === "draft" ? (
								<Button size="sm" className="bg-[#10b981] hover:bg-emerald-600" onClick={publish}>
									<CheckCircle2 className="w-3.5 h-3.5 mr-1" />
									确认发布
								</Button>
							) : (
								<Button size="sm" variant="outline" onClick={unpublish}>
									<XCircle className="w-3.5 h-3.5 mr-1" />
									取消发布
								</Button>
							)}
							<Button size="sm" variant="outline" className="text-red-500 hover:text-red-600" onClick={remove}>
								删除
							</Button>
						</>
					)}
					{editing && (
						<>
							<Button size="sm" variant="outline" onClick={() => { setDraft(outline.content_md); setEditing(false) }}>
								取消
							</Button>
							<Button size="sm" className="bg-[#1677ff] hover:bg-[#0958d9]" onClick={save} disabled={saving}>
								{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
								保存
							</Button>
						</>
					)}
				</div>
			</div>

			{editing ? (
				<Textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					className="min-h-[560px] font-mono text-[13px] leading-relaxed"
				/>
			) : (
				<OutlineRenderer markdown={outline.content_md} audience={audience} />
			)}
		</div>
	)
}

export default function MaterialDetailPage() {
	const params = useParams<{ id: string }>()
	const id = params.id
	const [data, setData] = useState<Response | null>(null)
	const [loading, setLoading] = useState(true)
	const [genBank, setGenBank] = useState<null | "easy" | "medium">(null)

	const load = useCallback(() => {
		setLoading(true)
		apiGet<Response>(`/api/materials/${id}`)
			.then(setData)
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [id])

	useEffect(() => {
		load()
	}, [load])

	const generateBank = async (difficulty: "easy" | "medium") => {
		setGenBank(difficulty)
		try {
			await apiPost(`/api/materials/${id}/questions`, { difficulty })
			toast.success(`${difficulty === "easy" ? "简易" : "中等"}题库已生成（草稿），前往题库详情审核发布`)
			load()
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setGenBank(null)
		}
	}

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="skeleton h-8 w-64 rounded" />
				<div className="skeleton h-40 rounded-xl" />
				<div className="skeleton h-96 rounded-xl" />
			</div>
		)
	}
	if (!data) return null

	const worker = data.outlines.find((o) => o.audience === "worker")
	const trainer = data.outlines.find((o) => o.audience === "trainer")

	return (
		<div className="space-y-6">
			<div>
				<Link href="/admin/materials" className="inline-flex items-center text-sm text-gray-500 hover:text-[#1677ff]">
					<ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回材料列表
				</Link>
			</div>

			<div className="brand-card rounded-xl p-6 flex items-start justify-between gap-6 flex-wrap">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-[22px] font-semibold text-gray-900">{data.material.title}</h1>
						<Badge variant="outline" className="uppercase">
							{data.material.file_type}
						</Badge>
					</div>
					<div className="text-sm text-gray-500 mt-1">{data.material.file_name}</div>
				</div>
				<div className="flex gap-2 flex-wrap">
					<Button
						variant="outline"
						onClick={() => generateBank("easy")}
						disabled={genBank !== null}
					>
						{genBank === "easy" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						AI 生成简易题库
					</Button>
					<Button
						variant="outline"
						onClick={() => generateBank("medium")}
						disabled={genBank !== null}
					>
						{genBank === "medium" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						AI 生成中等题库
					</Button>
				</div>
			</div>

			{data.banks.length > 0 && (
				<Card className="border-0 brand-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base flex items-center gap-2">
							<ListTree className="w-4 h-4 text-[#1677ff]" />
							关联题库
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						{data.banks.map((b) => (
							<Link key={b.id} href={`/admin/banks/${b.id}`}>
								<div className="flex items-center gap-2 rounded-lg border border-gray-200 hover:border-[#1677ff] hover:bg-[#eff6ff]/50 px-3 py-2 transition">
									<div className="w-8 h-8 rounded-lg bg-[#eff6ff] flex items-center justify-center text-[#1677ff]">
										<ListTree className="w-4 h-4" />
									</div>
									<div>
										<div className="text-sm font-medium text-gray-800">{b.title}</div>
										<div className="text-[11px] text-gray-500 mt-0.5">
											{b.difficulty === "easy" ? "简易" : "中等"} · {b.total_count} 题
											{b.status && (
												<span className={`ml-2 ${b.status === "published" ? "text-green-600" : "text-orange-600"}`}>
													· {b.status === "published" ? "已发布" : "待审"}
												</span>
											)}
										</div>
									</div>
								</div>
							</Link>
						))}
					</CardContent>
				</Card>
			)}

			<Tabs defaultValue="worker" className="space-y-4">
				<TabsList className="bg-white border border-gray-200 shadow-sm">
					<TabsTrigger value="worker">🧑‍🏭 工人版</TabsTrigger>
					<TabsTrigger value="trainer">🎓 培训师版</TabsTrigger>
				</TabsList>
				<TabsContent value="worker">
					<OutlineCard outline={worker} audience="worker" onRefresh={load} materialId={id} />
				</TabsContent>
				<TabsContent value="trainer">
					<OutlineCard outline={trainer} audience="trainer" onRefresh={load} materialId={id} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
