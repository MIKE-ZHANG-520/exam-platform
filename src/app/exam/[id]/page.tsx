"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiGet, apiPost } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, ShieldCheck, Clock, GraduationCap, AlertCircle } from "lucide-react"

interface Exam {
	id: string
	title: string
	paper_type: "A" | "B"
	duration_min: number
	pass_score: number
	total_score: number
	max_attempts: number
	required_fields: { name: boolean; phone: boolean; team: boolean; id_card: boolean }
	status: string
}

interface StartResp {
	record_id: string
	duration_min: number
	pass_score: number
	total: number
	attempt_no: number
	items: Array<{
		question_id: string
		type: "single" | "multiple" | "judge"
		content: string
		options: Array<{ key: string; text: string }>
	}>
}

// 班组固定选项
const TEAM_OPTIONS = [
	{ value: "EM", label: "EM" },
	{ value: "监理", label: "监理" },
	{ value: "中闽大秦总包", label: "中闽大秦总包" },
	{ value: "中闽大秦分包", label: "中闽大秦分包" },
] as const

export default function ExamEntryPage() {
	const params = useParams<{ id: string }>()
	const router = useRouter()
	const [exam, setExam] = useState<Exam | null>(null)
	const [loading, setLoading] = useState(true)
	const [starting, setStarting] = useState(false)
	const [form, setForm] = useState({ candidate_name: "", phone: "", team: "", team_detail: "", id_card: "" })

	useEffect(() => {
		apiGet<{ exam: Exam }>(`/api/exams/${params.id}/public`)
			.then((r) => setExam(r.exam))
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [params.id])

	const onStart = async () => {
		if (!exam) return
		if (!form.candidate_name.trim()) return toast.error("请填写姓名")
		if (exam.required_fields?.phone && !form.phone.trim()) return toast.error("请填写手机号")
		if (exam.required_fields?.team && !form.team.trim()) return toast.error("请选择班组")
		if (form.team === "中闽大秦分包" && !form.team_detail.trim()) return toast.error("中闽大秦分包必须填写具体班组名称")
		if (exam.required_fields?.id_card && !form.id_card.trim()) return toast.error("请填写身份证号")
		if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone.trim())) return toast.error("手机号格式不正确")

		setStarting(true)
		try {
			// 合并班组字段：中闽大秦分包 → "中闽大秦分包·{具体班组}"；其他直接用 team 值
			const payload = {
				...form,
				team:
					form.team === "中闽大秦分包" && form.team_detail.trim()
						? `中闽大秦分包·${form.team_detail.trim()}`
						: form.team,
			}
			const res = await apiPost<StartResp>(`/api/exams/${params.id}/public`, payload)
			const pack = {
				record_id: res.record_id,
				exam_id: params.id,
				duration_min: res.duration_min,
				pass_score: res.pass_score,
				started_at: Date.now(),
				items: res.items,
			}
			sessionStorage.setItem(`exam_paper_${res.record_id}`, JSON.stringify(pack))
			router.replace(`/exam/${params.id}/paper?rid=${res.record_id}`)
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setStarting(false)
		}
	}

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#e6f4ff] to-white">
				<Loader2 className="h-6 w-6 animate-spin text-[#1677ff]" />
			</div>
		)
	}

	if (!exam) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-[#e6f4ff] to-white p-8">
				<div className="mx-auto max-w-md text-center pt-20">
					<div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
						<AlertCircle className="w-8 h-8 text-red-500" />
					</div>
					<p className="text-base text-gray-700 font-medium">试卷不存在或已下线</p>
					<p className="text-sm text-gray-500 mt-1">请联系管理员</p>
				</div>
			</div>
		)
	}

	const rf = exam.required_fields || { name: true, phone: true, team: true, id_card: false }

	return (
		<div className="min-h-screen bg-gradient-to-b from-[#e6f4ff] via-[#f0f7ff] to-white pb-10">
			<div className="bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-white pt-8 pb-14 px-5 relative overflow-hidden">
				<div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
				<div className="absolute -right-4 top-16 w-24 h-24 rounded-full bg-white/10" />
				<div className="relative mx-auto max-w-md">
					<div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-3">
						<GraduationCap className="w-7 h-7" />
					</div>
					<h1 className="text-xl font-bold leading-tight">{exam.title}</h1>
					<div className="mt-3 flex items-center gap-3 text-white/90 text-xs">
						<span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{exam.duration_min} 分钟</span>
						<span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />及格 {exam.pass_score} 分</span>
						<span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">{exam.paper_type} 卷</span>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-md px-4 -mt-8">
				<Card className="border-0 shadow-xl rounded-2xl">
					<CardContent className="p-5 space-y-4">
						<div>
							<Label className="mb-1.5 block text-sm text-gray-700 font-medium">
								姓名 <span className="text-red-500">*</span>
							</Label>
							<Input value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} placeholder="请输入你的姓名" className="h-11 rounded-lg" />
						</div>
						{rf.phone && (
							<div>
								<Label className="mb-1.5 block text-sm text-gray-700 font-medium">
									手机号 <span className="text-red-500">*</span>
								</Label>
								<Input type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="用于成绩查询" className="h-11 rounded-lg" />
							</div>
						)}
						{rf.team && (
							<div>
								<Label className="mb-1.5 block text-sm text-gray-700 font-medium">
									班组 <span className="text-red-500">*</span>
								</Label>
								<Select value={form.team} onValueChange={(v) => setForm({ ...form, team: v, team_detail: "" })}>
									<SelectTrigger className="h-11 rounded-lg">
										<SelectValue placeholder="请选择所在班组" />
									</SelectTrigger>
									<SelectContent>
										{TEAM_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{form.team === "中闽大秦分包" && (
									<div className="mt-2">
										<Label className="mb-1.5 block text-sm text-gray-700 font-medium">
											具体班组名称 <span className="text-red-500">*</span>
										</Label>
										<Input
											value={form.team_detail}
											onChange={(e) => setForm({ ...form, team_detail: e.target.value })}
											placeholder="例如：电气一班、管道二班"
											className="h-11 rounded-lg"
										/>
									</div>
								)}
							</div>
						)}
						{rf.id_card && (
							<div>
								<Label className="mb-1.5 block text-sm text-gray-700 font-medium">
									身份证号 <span className="text-red-500">*</span>
								</Label>
								<Input value={form.id_card} onChange={(e) => setForm({ ...form, id_card: e.target.value })} placeholder="18 位身份证号，加密存储" className="h-11 rounded-lg" />
							</div>
						)}
						<div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-xs text-orange-700 leading-relaxed">
							<div className="flex items-center gap-1 font-medium mb-1">
								<AlertCircle className="w-3.5 h-3.5" />答题须知
							</div>
							<ul className="ml-4 list-disc space-y-0.5">
								<li>每人 {exam.max_attempts} 次考试机会</li>
								<li>切屏超过 3 次自动交卷</li>
								<li>超时未交卷将自动交卷</li>
							</ul>
						</div>
						<Button onClick={onStart} disabled={starting} className="w-full h-12 rounded-lg text-base font-medium bg-gradient-to-r from-[#1677ff] to-[#0958d9] hover:brightness-110 shadow-lg shadow-blue-200">
							{starting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />进入中...</> : "开始答题"}
						</Button>
					</CardContent>
				</Card>
				<p className="mt-4 text-center text-[11px] text-gray-400">智慧培训考试平台 · 安全生产培训</p>
			</div>
		</div>
	)
}
