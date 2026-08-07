"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiGet, fmtDuration } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, CheckCircle2, XCircle, ArrowRight, Sparkles } from "lucide-react"

interface Response {
	record: {
		id: string
		candidate_name: string
		team: string | null
		score: number | null
		is_pass: boolean | null
		attempt_no: number
		duration_sec: number | null
		status: string
	}
	exam: { title: string; pass_score: number } | null
}

function ResultInner() {
	const params = useParams<{ id: string }>()
	const sp = useSearchParams()
	const router = useRouter()
	const rid = sp.get("rid") || ""
	const [data, setData] = useState<Response | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		if (!rid) {
			router.replace(`/exam/${params.id}`)
			return
		}
		apiGet<Response>(`/api/records/${rid}`)
			.then(setData)
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [rid, params.id, router])

	if (loading || !data) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#e6f4ff] to-white">
				<Loader2 className="h-6 w-6 animate-spin text-[#1677ff]" />
			</div>
		)
	}

	const r = data.record
	const passed = !!r.is_pass

	return (
		<div className={`min-h-screen ${passed ? "bg-gradient-to-b from-emerald-50 via-white to-white" : "bg-gradient-to-b from-red-50 via-white to-white"} pb-10`}>
			<div className={`pt-10 pb-16 px-5 relative overflow-hidden ${passed ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-red-400 to-red-600"} text-white`}>
				<div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
				<div className="absolute right-16 top-20 w-16 h-16 rounded-full bg-white/10" />
				<div className="relative text-center">
					<div className="mx-auto w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mb-3">
						{passed ? <CheckCircle2 className="w-11 h-11" /> : <XCircle className="w-11 h-11" />}
					</div>
					<h1 className="text-2xl font-bold">{passed ? "恭喜通过啦！" : "别灰心，再来一次"}</h1>
					<p className="text-white/90 text-sm mt-1">{passed ? "继续保持安全操作规范" : "回顾错题，下次一定过"}</p>
				</div>
			</div>

			<div className="mx-auto max-w-md px-4 -mt-10">
				<Card className="border-0 shadow-xl rounded-2xl">
					<CardContent className="p-6 text-center">
						<p className="text-xs text-gray-500 mb-1">你的成绩</p>
						<div className="flex items-baseline justify-center gap-1">
							<span className={`text-6xl font-bold tabular-nums ${passed ? "text-emerald-600" : "text-red-500"}`}>{r.score ?? 0}</span>
							<span className="text-lg text-gray-400 font-medium">/ 100</span>
						</div>
						<p className="mt-1 text-xs text-gray-500">及格线 {data.exam?.pass_score ?? 80} 分</p>
					</CardContent>
				</Card>

				<Card className="mt-4 border-0 shadow-sm rounded-xl">
					<CardContent className="grid grid-cols-2 gap-4 p-5 text-sm">
						<Row label="姓名" value={r.candidate_name} />
						<Row label="班组" value={r.team || "-"} />
						<Row label="试卷" value={data.exam?.title || ""} />
						<Row label="第几次" value={`第 ${r.attempt_no} 次`} />
						<Row label="用时" value={fmtDuration(r.duration_sec)} />
						<Row label="交卷方式" value={r.status === "auto_submitted" ? "自动交卷" : "手动提交"} />
					</CardContent>
				</Card>

				{!passed && (
					<div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-700 leading-relaxed">
						你已用完本轮 2 次考试机会，请 12 小时后再试，或联系管理员安排补训。
					</div>
				)}

				<Button
					onClick={() => router.replace(`/exam/${params.id}/evaluate?rid=${r.id}`)}
					className="mt-6 h-12 w-full rounded-xl text-base bg-gradient-to-r from-[#1677ff] to-[#0958d9] hover:brightness-110 shadow-lg shadow-blue-200"
				>
					<Sparkles className="mr-2 h-4 w-4" /> 给培训师打个分 <ArrowRight className="ml-2 h-4 w-4" />
				</Button>
			</div>
		</div>
	)
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-xs text-gray-400">{label}</p>
			<p className="mt-1 text-sm font-medium text-gray-800">{value}</p>
		</div>
	)
}

export default function ResultPage() {
	return (
		<Suspense fallback={<div className="p-8 text-center text-sm text-gray-500"><Loader2 className="inline mr-2 h-4 w-4 animate-spin" />加载中...</div>}>
			<ResultInner />
		</Suspense>
	)
}
