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
import { ArrowLeft, Loader2, Sparkles, Pencil, Save, CheckCircle2, XCircle, ListTree, ShieldAlert, FileText, Eye, Download } from "lucide-react"
import { OutlineRenderer } from "@/components/admin/outline-renderer"
import { FilePreview } from "@/components/admin/file-preview"
import { parsePDFText } from "@/lib/pdf-parser"

// —— 生成要求预设模板（题库/提纲共用） ——
const NOTE_TEMPLATES: { label: string; value: string }[] = [
	{ label: "通用（AI 自由发挥）", value: "" },
	{ label: "分类识别重点", value: "重点考察材料中提到的分级/分类概念（如一类/二类/一般红线的分类归属），分类识别题至少占 40%，覆盖所有分类子项，含分类对比题。" },
	{ label: "操作规程强化", value: "重点考察操作步骤、执行顺序、禁忌行为与安全交底，情景题至少 50%，多考「该做什么／不该做什么」。" },
	{ label: "数字记忆强化", value: "重点考察限值、周期、罚款金额、距离/高度、许可等级等数字，数字类题目至少 30%。" },
	{ label: "应急处置重点", value: "重点考察应急处置步骤、疏散逃生路线、紧急联系人和上报流程，情景题为主。" },
]

function NoteComposer({
	label,
	note,
	onChange,
	disabled,
}: {
	label: string
	note: string
	onChange: (v: string) => void
	disabled?: boolean
}) {
	// 默认展开，外层 details 已控制整体可见性，避免两层折叠
	const [expanded, setExpanded] = useState<boolean>(true)
	const matchedTemplate = NOTE_TEMPLATES.find((t) => t.value === note)?.label ?? "自定义"
	return (
		<div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center justify-between text-left"
			>
				<div className="flex items-center gap-2 text-sm">
					<Sparkles className="h-4 w-4 text-blue-500" />
					<span className="font-medium text-slate-700">{label}</span>
					{note ? (
						<Badge variant="secondary" className="ml-1 max-w-[220px] truncate">
							{matchedTemplate}
						</Badge>
					) : (
						<span className="text-xs text-slate-400">未填写 · AI 将自由发挥</span>
					)}
				</div>
				<span className="text-xs text-blue-600">{expanded ? "收起" : "展开"}</span>
			</button>
			{expanded ? (
				<div className="mt-3 space-y-2">
					<div className="flex flex-wrap gap-1.5">
						{NOTE_TEMPLATES.map((tpl) => (
							<button
								key={tpl.label}
								type="button"
								disabled={disabled}
								onClick={() => onChange(tpl.value)}
								className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
									note === tpl.value
										? "border-blue-500 bg-blue-50 text-blue-700"
										: "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
								}`}
							>
								{tpl.label}
							</button>
						))}
					</div>
					<Textarea
						value={note}
						onChange={(e) => onChange(e.target.value)}
						placeholder="例如：本材料考试重点是分清一类/二类红线，分类识别题不少于 40%。不填则 AI 自由出题。"
						rows={3}
						disabled={disabled}
						className="text-sm"
					/>
					<div className="text-[11px] text-slate-400">
						最多 500 字。备注会保存到本次生成的记录中，下次自动回填。
					</div>
				</div>
			) : null}
		</div>
	)
}

interface Outline {
	id: string
	audience: "worker" | "trainer"
	content_md: string
	status: "draft" | "published"
	generation_note?: string | null
	created_at: string
}

interface Bank {
	id: string
	title: string
	difficulty: "easy" | "medium"
	total_count: number
	status?: string
	generation_note?: string | null
	created_at?: string
}

interface MaterialMetadata {
	regulations?: string[]
	clauses?: string[]
	risk_level?: "high" | "medium" | "low"
	risk_categories?: string[]
	applicable_positions?: string[]
	summary?: string
}

interface Material {
	id: string
	title: string
	file_name: string
	file_type: string
	file_url?: string | null
	status: string
	error_message?: string | null
	metadata?: MaterialMetadata | null
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
	isParsed,
}: {
	outline: Outline | undefined
	audience: "worker" | "trainer"
	onRefresh: () => void
	materialId: string
	isParsed: boolean
}) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(outline?.content_md || "")
	const [saving, setSaving] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [note, setNote] = useState<string>("")

	useEffect(() => {
		setDraft(outline?.content_md || "")
	}, [outline?.content_md])

	useEffect(() => {
		setNote(outline?.generation_note || "")
	}, [outline?.generation_note])

	const label = audience === "worker" ? "工人版" : "培训师版"

	const [genStage, setGenStage] = useState<string>("")

	const generate = async () => {
		setGenerating(true)
		setGenStage("准备中")
		try {
			// 提交任务到后台队列
			const submitRes = await apiPost<{ success: boolean; task_id: string; message: string }>(
				`/api/materials/${materialId}/generate-outline`,
				{ audience, note: note.trim() },
			)

			if (!submitRes.success || !submitRes.task_id) {
				throw new Error("提交任务失败")
			}

			const taskId = submitRes.task_id
			setGenStage("已提交 · 等待 Worker 处理")
			toast.info("提纲生成任务已提交，等待 Worker 处理...")

			// 轮询任务状态
			const pollInterval = 3000
			const maxPollTime = 5 * 60 * 1000 // 5分钟
			const startTime = Date.now()

			while (Date.now() - startTime < maxPollTime) {
				await new Promise((r) => setTimeout(r, pollInterval))

				const taskRes = await apiGet<{
					success: boolean
					task: {
						status: string
						progress?: { message?: string }
						error_message?: string
					}
				}>(`/api/tasks/${taskId}`)

				const task = taskRes.task

				if (task.progress?.message) {
					setGenStage(task.progress.message)
				} else {
					setGenStage(`处理中 · ${Math.round((Date.now() - startTime) / 1000)}s`)
				}

				if (task.status === "completed") {
					toast.success(`${label}提纲已生成并自动发布`)
					onRefresh()
					break
				}

				if (task.status === "failed") {
					throw new Error(task.error_message || "提纲生成失败")
				}
			}

			if (Date.now() - startTime >= maxPollTime) {
				toast.warning("任务超时，请刷新页面查看结果")
			}
		} catch (e) {
			console.error("[outline] generate failed:", e)
			toast.error((e as Error).message)
		} finally {
			setGenerating(false)
			setGenStage("")
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
			<div className="brand-card rounded-xl p-6 sm:p-10">
				<div className="text-center">
					<div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] flex items-center justify-center">
						<Sparkles className="w-6 h-6 text-[#1677ff]" />
					</div>
					<div className="text-[15px] font-medium text-gray-800">暂无{label}提纲</div>
					<div className="text-sm text-gray-500 mt-1 mb-4">让 AI 基于材料内容为你生成一份高质量提纲</div>
				</div>
				{/* 生成要求（选填）· 与题库卡片视觉统一 */}
				<details open className="mx-auto max-w-lg bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm mb-4">
					<summary className="cursor-pointer text-sm font-medium text-slate-700 select-none flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-primary" />
						生成要求（选填）
						{note.trim() && (
							<Badge variant="secondary" className="ml-auto text-[11px]">已设定</Badge>
						)}
					</summary>
					<div className="mt-3">
						<NoteComposer label={`${label}提纲生成要求`} note={note} onChange={setNote} disabled={generating} />
						<div className="text-[11px] text-slate-500 mt-2">
							此备注会作为「AI 生成{label}提纲」的补充要求。留空则 AI 依据材料自动决定重点。
						</div>
					</div>
				</details>
				<div className="mt-4 text-center">
					<Button className="bg-[#1677ff] hover:bg-[#0958d9]" onClick={generate} disabled={generating || !isParsed} title={!isParsed ? "请先解析文件内容" : undefined}>
						{generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
						AI 生成{label}提纲
					</Button>
					{generating && genStage && (
						<div className="text-xs text-[#1677ff] mt-3">{genStage}</div>
					)}
				</div>
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
				</div>				<div className="flex gap-2">
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

			{!editing && (
				<details className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
					<summary className="cursor-pointer text-sm font-medium text-slate-700 select-none flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-primary" />
						生成要求（选填，重新生成时使用）
						{note.trim() && (
							<Badge variant="secondary" className="ml-auto text-[11px]">已设定</Badge>
						)}
					</summary>
					<div className="mt-3">
						<NoteComposer label={`${label}重新生成要求`} note={note} onChange={setNote} disabled={generating} />
						<div className="text-[11px] text-slate-500 mt-2">
							此备注会作为下一次「AI 重新生成{label}提纲」的补充要求。点击上方「重新生成」按钮生效。
						</div>
					</div>
				</details>
			)}

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
	const [genBankElapsed, setGenBankElapsed] = useState(0)
	const [genBankBatch, setGenBankBatch] = useState(0)
	const [genBankTotal, setGenBankTotal] = useState(0)
	const [bankNote, setBankNote] = useState("")

	// 从最近一次生成的题库中回填备注
	useEffect(() => {
		if (!data) return
		const latest = data.banks.length > 0 ? data.banks[data.banks.length - 1] : undefined
		const savedNote = latest?.generation_note
		if (typeof savedNote === "string" && savedNote.trim() && !bankNote) {
			setBankNote(savedNote)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.banks?.length])

	// 自动轮询解析状态：如果材料正在解析，每 3 秒刷新一次
	useEffect(() => {
		if (!data) return
		const status = data.material.status
		if (status !== "parsing" && status !== "uploaded") return

		const interval = setInterval(() => {
			apiGet<Response>(`/api/materials/${id}`)
				.then((res) => {
					setData(res)
					// 解析完成后停止轮询
					if (res.material.status !== "parsing" && res.material.status !== "uploaded") {
						clearInterval(interval)
						if (res.material.status === "parsed" || res.material.status === "ready") {
							toast.success("文件解析完成，现在可以生成提纲和题库了")
						}
					}
				})
				.catch(() => {})
		}, 3000)

		return () => clearInterval(interval)
	}, [data?.material?.status, id])

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

	const generateBank = async (difficulty: "easy" | "medium", note: string) => {
		setGenBank(difficulty)
		setGenBankElapsed(0)
		setGenBankBatch(0)
		setGenBankTotal(0)
		const timer = setInterval(() => setGenBankElapsed((s) => s + 1), 1000)

		try {
			// 使用同步 API（start/poll/finalize）
			const startRes = await apiPost<{ success: boolean; bank_id: string; chat_id: string; conversation_id: string; total_batches: number }>(
				`/api/materials/${id}/questions`,
				{ action: "start", difficulty, note, batchIndex: 0 },
			)

			if (!startRes.success || !startRes.bank_id) {
				throw new Error("启动生成失败")
			}

			const bankId = startRes.bank_id
			const chatId = startRes.chat_id
			const conversationId = startRes.conversation_id
			const totalBatches = startRes.total_batches
			setGenBankTotal(totalBatches)

			// 轮询每一批
			for (let batch = 0; batch < totalBatches; batch++) {
				setGenBankBatch(batch + 1)
				
				// 等待当前批次完成
				let attempts = 0
				while (attempts < 60) {
					await new Promise((r) => setTimeout(r, 2000))
					attempts++
					
					const pollRes = await apiPost<{ success: boolean; done: boolean; questions?: unknown[] }>(
						`/api/materials/${id}/questions`,
						{ action: "poll", bankId, batchIndex: batch, chatId, conversationId },
					)
					
					if (pollRes.done) break
				}
			}

			// 完成
			await apiPost(`/api/materials/${id}/questions`, { action: "finalize", bankId, chatId, conversationId })
			toast.success("题库生成完成")
			await load()
		} catch (err) {
			toast.error(`题库生成失败：${err instanceof Error ? err.message : String(err)}`)
		} finally {
			setGenBank(null)
			clearInterval(timer)
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
	const isParsed = data.material.status === "parsed" || data.material.status === "ready" || data.material.status === "generating"
	const isParsing = data.material.status === "parsing"

	return (
		<div className="space-y-6">
			<div>
				<Link href="/admin/materials" className="inline-flex items-center text-sm text-gray-500 hover:text-[#1677ff]">
					<ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回材料列表
				</Link>
			</div>

			{/* 解析状态提示 */}
			{!isParsed && !isParsing && (
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
					<div className="flex items-start gap-3">
						<div className="rounded-lg bg-amber-100 p-2">
							<ShieldAlert className="h-5 w-5 text-amber-600" />
						</div>
						<div className="flex-1">
							<h3 className="text-sm font-medium text-amber-800">材料尚未解析</h3>
							<p className="text-xs text-amber-600 mt-1">
								{data.material.status === "failed" 
									? `解析失败：${data.material.error_message || "未知错误"}，请删除后重新上传`
									: "请先解析文件内容，才能生成提纲和题库"}
							</p>
							{data.material.status !== "failed" && (
								<Button
									size="sm"
									className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
									onClick={async () => {
										try {
											const isPDF = data.material.file_type === "pdf" || data.material.file_name.toLowerCase().endsWith(".pdf")
											
											if (isPDF && data.material.file_url) {
												// PDF 文件使用前端解析
												toast.info("正在解析 PDF 文件，请稍候...")
												
												const result = await parsePDFText(
													data.material.file_url,
													(progress) => {
														toast.info(`正在解析 PDF... 第 ${progress.currentPage}/${progress.totalPages} 页`)
													}
												)
												
												if (!result.text || result.text.length < 10) {
													throw new Error("PDF 文本提取失败，内容过少或为扫描件")
												}
												
												toast.info("保存解析结果...")
												await apiPost(`/api/materials/${id}/save-parse`, {
													text: result.text,
													pageCount: result.pageCount,
													wordCount: result.wordCount,
													charCount: result.charCount,
												})
												
												toast.success("PDF 解析完成")
											} else {
												// 其他格式使用后端解析
												toast.info("正在解析文件，请稍候...")
												await apiPost(`/api/materials/${id}/parse`, {})
												toast.success("解析完成")
											}
											load()
										} catch (e) {
											toast.error((e as Error).message)
										}
									}}
								>
									<FileText className="w-3.5 h-3.5 mr-1.5" />
									立即解析
								</Button>
							)}
						</div>
					</div>
				</div>
			)}
			{isParsing && (
				<div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
					<div className="flex items-center gap-3">
						<Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
						<div>
							<h3 className="text-sm font-medium text-blue-800">正在解析文件内容...</h3>
							<p className="text-xs text-blue-600 mt-0.5">解析完成后即可生成提纲和题库</p>
						</div>
					</div>
				</div>
			)}

			<div className="brand-card rounded-xl p-6 flex items-start justify-between gap-6 flex-wrap">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-[22px] font-semibold text-gray-900">{data.material.title}</h1>
						<Badge variant="outline" className="uppercase">
							{data.material.file_type}
						</Badge>
						<Badge className={
							isParsed ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
							isParsing ? "bg-amber-50 text-amber-700 border-amber-200" :
							"bg-gray-50 text-gray-600 border-gray-200"
						} variant="outline">
							{isParsed ? "已解析" : isParsing ? "解析中" : "未解析"}
						</Badge>
					</div>
					<div className="text-sm text-gray-500 mt-1">{data.material.file_name}</div>
				</div>
				<div className="flex gap-2 flex-wrap">
					<Button
						variant="outline"
						onClick={() => generateBank("easy", bankNote)}
						disabled={genBank !== null || !isParsed}
						title={!isParsed ? "请先解析文件内容" : undefined}
					>
						{genBank === "easy" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						{genBank === "easy"
							? `生成中 ${genBankBatch}/8 · 已产出 ${genBankTotal} 题（${genBankElapsed}s）`
							: "AI 生成简易题库"}
					</Button>
					<Button
						variant="outline"
						onClick={() => generateBank("medium", bankNote)}
						disabled={genBank !== null || !isParsed}
						title={!isParsed ? "请先解析文件内容" : undefined}
					>
						{genBank === "medium" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						{genBank === "medium"
							? `生成中 ${genBankBatch}/8 · 已产出 ${genBankTotal} 题（${genBankElapsed}s）`
							: "AI 生成中等题库"}
					</Button>
				</div>
			</div>

			{/* 题库生成要求（简易/中等共用） */}
			<details className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
				<summary className="cursor-pointer text-sm font-medium text-slate-700 select-none flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-primary" />
					生成要求（选填，简易/中等共用）
					{bankNote.trim() && (
						<Badge variant="secondary" className="ml-auto text-[11px]">已设定</Badge>
					)}
				</summary>
				<div className="mt-3">
					<NoteComposer
						label="题库生成要求"
						note={bankNote}
						onChange={setBankNote}
						disabled={genBank !== null}
					/>
					<div className="text-[11px] text-slate-500 mt-2">
						此备注会作为下一次「AI 生成简易/中等题库」的补充要求。留空则 AI 依据材料自动决定题型分布。
					</div>
				</div>
			</details>

			{data.material.metadata && (
				<Card className="border-0 brand-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base flex items-center gap-2">
							<ShieldAlert className="w-4 h-4 text-[#f97316]" />
							安全要点识别
							<Badge variant="outline" className="ml-1 text-[10px] text-gray-500 font-normal">AI 识别 · 仅供参考</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{data.material.metadata.summary && (
							<div className="text-sm text-gray-700 leading-relaxed bg-[#f5f7fa] rounded-lg p-3 border border-gray-100">
								{data.material.metadata.summary}
							</div>
						)}
						<div className="grid gap-3 md:grid-cols-3">
							{data.material.metadata.risk_level && (
								<div>
									<div className="text-[11px] text-gray-500 mb-1">风险等级</div>
									<Badge
										className={
											data.material.metadata.risk_level === "high"
												? "bg-red-100 text-red-700 border-red-200"
												: data.material.metadata.risk_level === "medium"
													? "bg-orange-100 text-orange-700 border-orange-200"
													: "bg-yellow-100 text-yellow-700 border-yellow-200"
										}
										variant="outline"
									>
										{data.material.metadata.risk_level === "high"
											? "🔴 重大风险"
											: data.material.metadata.risk_level === "medium"
												? "🟠 较大风险"
												: "🟡 一般风险"}
									</Badge>
								</div>
							)}
							{data.material.metadata.applicable_positions && data.material.metadata.applicable_positions.length > 0 && (
								<div>
									<div className="text-[11px] text-gray-500 mb-1">适用岗位</div>
									<div className="flex flex-wrap gap-1">
										{data.material.metadata.applicable_positions.map((p) => (
											<Badge key={p} variant="outline" className="bg-[#eff6ff] text-[#1677ff] border-[#dbeafe]">
												{p}
											</Badge>
										))}
									</div>
								</div>
							)}
							{data.material.metadata.risk_categories && data.material.metadata.risk_categories.length > 0 && (
								<div>
									<div className="text-[11px] text-gray-500 mb-1">风险场景</div>
									<div className="flex flex-wrap gap-1">
										{data.material.metadata.risk_categories.map((r) => (
											<Badge key={r} variant="outline" className="bg-[#fff7ed] text-[#f97316] border-orange-200">
												{r}
											</Badge>
										))}
									</div>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}

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
							<div key={b.id} className="flex items-center gap-2">
								<Link href={`/admin/banks/${b.id}`}>
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
								<div className="flex flex-col gap-1">
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-xs gap-1"
										onClick={() => window.open(`/api/banks/${b.id}/export?answer=true`, "_blank")}
									>
										<Download className="w-3 h-3" />
										含答案
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-xs gap-1"
										onClick={() => window.open(`/api/banks/${b.id}/export?answer=false`, "_blank")}
									>
										<Download className="w-3 h-3" />
										空白卷
									</Button>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{/* Preview Button */}
				<Card className="border-0 brand-card">
					<CardContent className="pt-5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
									<FileText className="w-5 h-5 text-blue-600" />
								</div>
								<div>
									<h3 className="text-sm font-medium text-slate-900">文件预览</h3>
									<p className="text-xs text-slate-500">在新窗口中查看文件内容</p>
								</div>
							</div>
							<Button
								variant="outline"
								className="gap-2"
								disabled={!isParsed}
								onClick={() => window.open(`/admin/materials/${id}/preview`, "_blank")}
							>
								<Eye className="w-4 h-4" />
								{isParsed ? "打开预览" : "未解析"}
							</Button>
						</div>
					</CardContent>
				</Card>

				<Tabs defaultValue="worker" className="space-y-4">
					<TabsList className="bg-white border border-gray-200 shadow-sm">
						<TabsTrigger value="worker">🧑‍🏭 工人版</TabsTrigger>
						<TabsTrigger value="trainer">🎓 培训师版</TabsTrigger>
					</TabsList>
					<TabsContent value="worker">
						<OutlineCard outline={worker} audience="worker" onRefresh={load} materialId={id} isParsed={isParsed} />
					</TabsContent>
					<TabsContent value="trainer">
						<OutlineCard outline={trainer} audience="trainer" onRefresh={load} materialId={id} isParsed={isParsed} />
					</TabsContent>
				</Tabs>
		</div>
	)
}
