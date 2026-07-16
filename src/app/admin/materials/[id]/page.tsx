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
import { ArrowLeft, Loader2, Sparkles, Pencil, Save, CheckCircle2, XCircle, ListTree, ShieldAlert } from "lucide-react"
import { OutlineRenderer } from "@/components/admin/outline-renderer"

// —— 生成要求预设模板（题库/提纲共用） ——
const NOTE_TEMPLATES: { label: string; value: string }[] = [
	{ label: "通用（才子佳人自由发挥）", value: "" },
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
	const [expanded, setExpanded] = useState<boolean>(Boolean(note))
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
						<span className="text-xs text-slate-400">未填写 · 才子佳人将自由发挥</span>
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
						placeholder="例如：本材料考试重点是分清一类/二类红线，分类识别题不少于 40%。不填则才子佳人自由出题。"
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
	status: string
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
		const t0 = Date.now()
		try {
			// 预热 FaaS
			try {
				const ctrl = new AbortController()
				const to = setTimeout(() => ctrl.abort(), 8000)
				await fetch("/api/warmup", { method: "POST", signal: ctrl.signal }).finally(() =>
					clearTimeout(to),
				)
			} catch (e) {
				console.warn("[outline] warmup 失败（不影响主流程）:", e)
			}

			// Step 1: start
			setGenStage("已提交 · 等待才子佳人思考")
			const startRes = await apiPost<{ chatId: string; conversationId: string }>(
				`/api/materials/${materialId}/outline`,
				{ action: "start", audience, note: note.trim() },
			)
			console.warn("[outline] start", startRes)

			// Step 2: poll（最长 120s）
			const pollMax = 60
			const pollInterval = 2000
			let ready = false
			for (let i = 0; i < pollMax; i++) {
				await new Promise((r) => setTimeout(r, pollInterval))
				const p = await apiPost<{ status: string; ready: boolean }>(
					`/api/materials/${materialId}/outline`,
					{ action: "poll", chatId: startRes.chatId, conversationId: startRes.conversationId },
				)
				setGenStage(`才子佳人生成中 · ${Math.round(((Date.now() - t0) / 1000))}s`)
				if (p.ready) {
					ready = true
					if (p.status === "failed") throw new Error("Bot 生成失败，请重试")
					break
				}
			}
			if (!ready) throw new Error("生成超时（120s 内未完成），请重试")

			// Step 3: finalize
			setGenStage("落库中")
			await apiPost(`/api/materials/${materialId}/outline`, {
				action: "finalize",
				chatId: startRes.chatId,
				conversationId: startRes.conversationId,
				audience,
				note: note.trim(),
			})
			toast.success(`${label}提纲已生成并自动发布`)
			onRefresh()
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
					<div className="text-sm text-gray-500 mt-1 mb-4">让才子佳人基于材料内容为你生成一份高质量提纲</div>
				</div>
				<div className="max-w-lg mx-auto text-left">
					<NoteComposer label={`${label}提纲生成要求`} note={note} onChange={setNote} disabled={generating} />
				</div>
				<div className="mt-4 text-center">
					<Button className="bg-[#1677ff] hover:bg-[#0958d9]" onClick={generate} disabled={generating}>
						{generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
						才子佳人生成{label}提纲
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
				<details className="rounded-lg bg-slate-50 border border-slate-100 text-xs">
					<summary className="cursor-pointer select-none px-3 py-2 text-slate-600 hover:text-slate-800">
						生成要求（重新生成时使用 · 选填）{note ? <span className="text-[#1677ff] ml-2">· 已填写</span> : null}
					</summary>
					<div className="px-3 pb-3">
						<NoteComposer label={`${label}重新生成要求`} note={note} onChange={setNote} disabled={generating} />
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

		// 三阶段调用：start → poll(N次) → finalize
		// 每次交互 <5s，避免网关超时
		const TOTAL = 8
		let bankId: string | null = null
		let totalGenerated = 0
		const failedBatches: number[] = []

		// 单次 fetch，带 30s 超时（覆盖冷启动 + Bot 网络往返）
		const doFetch = async (body: unknown, timeoutMs: number): Promise<Record<string, unknown>> => {
			const ctrl = new AbortController()
			const tid = setTimeout(() => ctrl.abort(), timeoutMs)
			try {
				const res = await fetch(`/api/materials/${id}/questions`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
					signal: ctrl.signal,
				})
				const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
				if (!res.ok) {
					const err = typeof data.error === "string" ? data.error : `HTTP ${res.status}`
					throw new Error(err)
				}
				return data
			} finally {
				clearTimeout(tid)
			}
		}

		// 带指数退避的重试（3 次，间隔 2s/4s/8s）——兜住 FaaS 冷启动 + 瞬时网络抖动
		const postJson = async (body: unknown, timeoutMs = 30_000): Promise<Record<string, unknown>> => {
			let lastErr: unknown = null
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					return await doFetch(body, timeoutMs)
				} catch (e) {
					lastErr = e
					const msg = e instanceof Error ? e.message : String(e)
					console.warn(`[questions] fetch attempt ${attempt + 1}/3 failed:`, msg)
					if (attempt < 2) {
						await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)))
					}
				}
			}
			throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
		}

		// 预热：先发一个 warmup 请求让 FaaS 冷启动完毕
		try {
			const ctrl = new AbortController()
			const tid = setTimeout(() => ctrl.abort(), 30_000)
			await fetch("/api/warmup", { method: "POST", signal: ctrl.signal }).finally(() =>
				clearTimeout(tid),
			)
		} catch (e) {
			console.warn("[questions] warmup 失败（不影响主流程）:", e)
		}

		try {
			for (let i = 0; i < TOTAL; i++) {
				setGenBankBatch(i + 1)
				try {
					// 1) start：创建 Bot 对话，立即返回 chatId
					const startResp = await postJson({
						action: "start",
						difficulty,
						batchIndex: i,
						bankId,
						note: i === 0 ? note : undefined,
					})
					const chatId = startResp.chatId as string
					const conversationId = startResp.conversationId as string
					bankId = (startResp.bankId as string) || bankId

					// 2) poll：每 2 秒 poll 一次，最多 60 次（120s）
					let ready = false
					for (let p = 0; p < 60; p++) {
						await new Promise((r) => setTimeout(r, 2000))
						const pollResp = await postJson({
							action: "poll",
							chatId,
							conversationId,
						})
						if (pollResp.ready === true) {
							ready = true
							break
						}
					}
					if (!ready) {
						failedBatches.push(i + 1)
						console.error(`第 ${i + 1} 批 poll 超时`)
						continue
					}

					// 3) finalize：拉取回复、解析、入库
					const finalResp = await postJson({
						action: "finalize",
						chatId,
						conversationId,
						bankId,
						batchIndex: i,
						difficulty,
					})
					if (typeof finalResp.totalGenerated === "number") {
						totalGenerated = finalResp.totalGenerated
						setGenBankTotal(totalGenerated)
					}
					if (finalResp.error) {
						failedBatches.push(i + 1)
						console.warn(`第 ${i + 1} 批解析出错:`, finalResp.error)
					}
				} catch (batchErr) {
					failedBatches.push(i + 1)
					console.error(`第 ${i + 1} 批失败:`, batchErr)
				}
			}

			if (totalGenerated === 0) {
				toast.error("题库生成失败，所有批次均未产出题目，请重试")
			} else if (failedBatches.length > 0) {
				toast.warning(
					`${difficulty === "easy" ? "简易" : "中等"}题库已生成 ${totalGenerated} 题（第 ${failedBatches.join("、")} 批失败）`,
				)
			} else {
				toast.success(`${difficulty === "easy" ? "简易" : "中等"}题库已生成 ${totalGenerated} 题并自动发布`)
			}
			load()
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			clearInterval(timer)
			setGenBank(null)
			setGenBankElapsed(0)
			setGenBankBatch(0)
			setGenBankTotal(0)
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
						onClick={() => generateBank("easy", bankNote)}
						disabled={genBank !== null}
					>
						{genBank === "easy" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						{genBank === "easy"
							? `生成中 ${genBankBatch}/8 · 已产出 ${genBankTotal} 题（${genBankElapsed}s）`
							: "才子佳人生成简易题库"}
					</Button>
					<Button
						variant="outline"
						onClick={() => generateBank("medium", bankNote)}
						disabled={genBank !== null}
					>
						{genBank === "medium" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
						{genBank === "medium"
							? `生成中 ${genBankBatch}/8 · 已产出 ${genBankTotal} 题（${genBankElapsed}s）`
							: "才子佳人生成中等题库"}
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
						此备注会作为下一次「才子佳人生成简易/中等题库」的补充要求。留空则才子佳人依据材料自动决定题型分布。
					</div>
				</div>
			</details>

			{data.material.metadata && (
				<Card className="border-0 brand-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base flex items-center gap-2">
							<ShieldAlert className="w-4 h-4 text-[#f97316]" />
							安全要点识别
							<Badge variant="outline" className="ml-1 text-[10px] text-gray-500 font-normal">才子佳人识别 · 仅供参考</Badge>
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
