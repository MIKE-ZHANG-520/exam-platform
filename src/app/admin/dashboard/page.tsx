"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
	Users,
	UserCheck,
	Percent,
	TrendingUp,
	AlertTriangle,
	Award,
	ArrowRight,
	Trophy,
	BarChart3,
	Target,
	GraduationCap,
} from "lucide-react"
import {
	ResponsiveContainer,
	AreaChart,
	Area,
	Tooltip,
	CartesianGrid,
	XAxis,
	YAxis,
	BarChart,
	Bar,
	LineChart,
	Line,
	Cell,
	PieChart,
	Pie,
	Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/admin/page-header"

interface Kpi {
	total_records: number
	first_attempts: number
	passed: number
	failed: number
	pass_rate: number
	avg_score: number
	pending_retake: number
}

interface Trend {
	date: string
	participated: number
	passed: number
}

interface Bucket {
	name: string
	count: number
}

interface TeamStat {
	team: string
	participated: number
	passed: number
	pass_rate: number
}

interface Retake {
	id: string
	candidate_name: string
	phone: string
	team: string
	score: number
	attempt_no: number
}

interface ExamTypeStat {
	title: string
	participated: number
	passed: number
	pass_rate: number
	team_count: number
}

interface DashData {
	kpi: Kpi
	trend: Trend[]
	score_buckets: Bucket[]
	team_stats: TeamStat[]
	retake_list: Retake[]
	exam_type_stats: ExamTypeStat[]
}

const KPI_THEMES = [
	{ gradient: "from-[#1677ff] to-[#0958d9]", bg: "bg-[#eff6ff]", text: "text-[#1677ff]" },
	{ gradient: "from-[#10b981] to-[#059669]", bg: "bg-[#ecfdf5]", text: "text-[#10b981]" },
	{ gradient: "from-[#f97316] to-[#ea580c]", bg: "bg-[#fff7ed]", text: "text-[#f97316]" },
	{ gradient: "from-[#ef4444] to-[#dc2626]", bg: "bg-[#fef2f2]", text: "text-[#ef4444]" },
	{ gradient: "from-[#8b5cf6] to-[#7c3aed]", bg: "bg-[#f5f3ff]", text: "text-[#8b5cf6]" },
	{ gradient: "from-[#d97706] to-[#b45309]", bg: "bg-[#fefce8]", text: "text-[#d97706]" },
]

function KpiCard({
	icon: Icon,
	label,
	value,
	suffix,
	themeIdx,
	hint,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	value: string | number
	suffix?: string
	themeIdx: number
	hint?: string
}) {
	const t = KPI_THEMES[themeIdx % KPI_THEMES.length]
	return (
		<div className="brand-card rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg group">
			<div className="flex items-start justify-between">
				<div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}>
					<Icon className="w-5 h-5 text-white" />
				</div>
				{TrendingUp && themeIdx < 2 && (
					<div className={`flex items-center gap-0.5 text-[11px] ${t.text} font-medium`}>
						<TrendingUp className="w-3 h-3" />
						<span>活跃</span>
					</div>
				)}
			</div>
			<div className="mt-3">
				<div className="text-[13px] text-gray-500">{label}</div>
				<div className="mt-1 flex items-baseline gap-1">
					<span className="text-[30px] font-bold text-gray-900 tabular-nums leading-none">{value}</span>
					{suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
				</div>
				{hint && <div className="text-[11px] text-gray-400 mt-1.5">{hint}</div>}
			</div>
		</div>
	)
}

const BUCKET_COLORS = ["#ef4444", "#f97316", "#3b82f6", "#10b981"]

export default function DashboardPage() {
	const [data, setData] = useState<DashData | null>(null)
	const [showExamType, setShowExamType] = useState(true)

	useEffect(() => {
		// 先处理超时记录，再加载看板数据
		fetch("/api/records/auto-expire", { method: "POST" }).catch(() => {})
		fetch("/api/dashboard")
			.then((r) => r.json())
			.then(setData)
			.catch(() => setData(null))
	}, [])

	if (!data) {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="skeleton h-32 rounded-xl" />
					))}
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<div className="skeleton h-72 rounded-xl lg:col-span-2" />
					<div className="skeleton h-72 rounded-xl" />
				</div>
			</div>
		)
	}

	const k = data.kpi
	const teamStatsSorted = [...data.team_stats].sort((a, b) => b.pass_rate - a.pass_rate)

	return (
		<div className="space-y-6">
			<PageHeader title="数据看板" subtitle="培训考试情况全景概览" icon={<BarChart3 className="h-5 w-5" />} />

			{/* KPI 卡片 */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				<KpiCard icon={Users} label="参考总人次" value={k.total_records} themeIdx={0} hint={`首考 ${k.first_attempts} 次`} />
				<KpiCard icon={UserCheck} label="通过人次" value={k.passed} themeIdx={1} hint={`未通过 ${k.failed} 次`} />
				<KpiCard icon={Percent} label="及格率" value={k.pass_rate.toFixed(1)} suffix="%" themeIdx={2} />
				<KpiCard icon={Award} label="平均分" value={k.avg_score.toFixed(1)} themeIdx={4} />
			</div>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				<KpiCard icon={AlertTriangle} label="待补考" value={k.pending_retake} themeIdx={3} hint="首考未过" />
				<KpiCard icon={TrendingUp} label="近 7 日参考" value={data.trend.reduce((s, t) => s + t.participated, 0)} themeIdx={0} />
				<KpiCard icon={Trophy} label="满分人次" value={data.score_buckets[3]?.count || 0} themeIdx={1} suffix="人" />
				<KpiCard icon={Target} label="参考班组" value={data.team_stats.length} themeIdx={4} suffix="个" />
			</div>

			{/* 趋势图 + 分数段分布 */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="brand-card lg:col-span-2 border-0">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-base flex items-center gap-2">
							<TrendingUp className="w-4 h-4 text-[#1677ff]" />
							近 7 日趋势
						</CardTitle>
						<div className="flex gap-3 text-xs text-gray-500">
							<span className="flex items-center gap-1.5"><i className="inline-block w-2 h-2 rounded-full bg-[#1677ff]" />参考人次</span>
							<span className="flex items-center gap-1.5"><i className="inline-block w-2 h-2 rounded-full bg-[#10b981]" />通过人次</span>
						</div>
					</CardHeader>
					<CardContent className="pt-2">
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
									<defs>
										<linearGradient id="c1" x1="0" x2="0" y1="0" y2="1">
											<stop offset="0%" stopColor="#1677ff" stopOpacity={0.35} />
											<stop offset="100%" stopColor="#1677ff" stopOpacity={0} />
										</linearGradient>
										<linearGradient id="c2" x1="0" x2="0" y1="0" y2="1">
											<stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
											<stop offset="100%" stopColor="#10b981" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
									<XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} fontSize={12} stroke="#9ca3af" />
									<YAxis fontSize={12} stroke="#9ca3af" allowDecimals={false} />
									<Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }} />
									<Area type="monotone" dataKey="participated" stroke="#1677ff" strokeWidth={2} fill="url(#c1)" />
									<Area type="monotone" dataKey="passed" stroke="#10b981" strokeWidth={2} fill="url(#c2)" />
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>

				<Card className="brand-card border-0">
					<CardHeader className="pb-2">
						<CardTitle className="text-base flex items-center gap-2">
							<BarChart3 className="w-4 h-4 text-[#8b5cf6]" />
							分数段分布
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-2">
						<div className="h-64">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={data.score_buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
									<CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
									<XAxis dataKey="name" fontSize={11} stroke="#9ca3af" />
									<YAxis fontSize={12} stroke="#9ca3af" allowDecimals={false} />
									<Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }} />
									<Bar dataKey="count" radius={[6, 6, 0, 0]}>
										{data.score_buckets.map((_, idx) => (
											<Cell key={idx} fill={BUCKET_COLORS[idx % BUCKET_COLORS.length]} />
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* 各考试类型分布 */}
			{showExamType && data.exam_type_stats.length > 0 && (
				<Card className="brand-card border-0">
					<CardHeader className="pb-2 flex flex-row items-center justify-between">
						<CardTitle className="text-base flex items-center gap-2">
							<BarChart3 className="w-4 h-4 text-[#8b5cf6]" />
							各考试类型分布
						</CardTitle>
						<div className="flex items-center gap-3">
							<span className="text-xs text-gray-400">按参考人次排序</span>
							<button
								onClick={() => setShowExamType(false)}
								className="text-xs text-gray-400 hover:text-gray-600"
							>
								隐藏
							</button>
						</div>
					</CardHeader>
				<CardContent className="pt-2">
					{data.exam_type_stats.length === 0 ? (
						<EmptyState hint="暂无考试类型数据" />
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-gray-100">
										<th className="text-left py-2 px-3 text-gray-500 font-medium">考试名称</th>
										<th className="text-right py-2 px-3 text-gray-500 font-medium">参考人数</th>
										<th className="text-right py-2 px-3 text-gray-500 font-medium">通过人数</th>
										<th className="text-right py-2 px-3 text-gray-500 font-medium">及格率</th>
										<th className="text-right py-2 px-3 text-gray-500 font-medium">参考班组</th>
									</tr>
								</thead>
								<tbody>
									{data.exam_type_stats.map((exam, idx) => (
										<tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
											<td className="py-3 px-3 font-medium text-gray-800">{exam.title}</td>
											<td className="py-3 px-3 text-right tabular-nums text-gray-700">{exam.participated}</td>
											<td className="py-3 px-3 text-right tabular-nums text-[#10b981] font-medium">{exam.passed}</td>
											<td className="py-3 px-3 text-right">
												<span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
													exam.pass_rate >= 80 ? "bg-[#ecfdf5] text-[#10b981]" :
													exam.pass_rate >= 60 ? "bg-[#fffbeb] text-[#d97706]" :
													"bg-[#fef2f2] text-[#ef4444]"
												}`}>
													{exam.pass_rate.toFixed(1)}%
												</span>
											</td>
											<td className="py-3 px-3 text-right tabular-nums text-gray-600">{exam.team_count} 个</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		)}

		{/* 显示开关 */}
		{!showExamType && data.exam_type_stats.length > 0 && (
			<div className="flex justify-end mb-2">
				<button
					onClick={() => setShowExamType(true)}
					className="text-xs text-[#1677ff] hover:underline flex items-center gap-1"
				>
					<BarChart3 className="w-3 h-3" />
					显示各考试类型分布
				</button>
			</div>
		)}

		{/* 班组排行 + 待补考清单 */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="brand-card lg:col-span-2 border-0">
					<CardHeader className="pb-2 flex flex-row items-center justify-between">
						<CardTitle className="text-base flex items-center gap-2">
							<GraduationCap className="w-4 h-4 text-[#1677ff]" />
							班组通过率排行
						</CardTitle>
						<span className="text-xs text-gray-400">按及格率排序</span>
					</CardHeader>
					<CardContent className="pt-2">
						{teamStatsSorted.length === 0 ? (
							<EmptyState hint="暂无班组考试数据" />
						) : (
							<div className="space-y-3">
								{teamStatsSorted.map((t, i) => (
									<div key={t.team} className="flex items-center gap-3">
										<div
											className={[
												"w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0",
												i === 0 ? "bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md" : i === 1 ? "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm" : i === 2 ? "bg-gradient-to-br from-orange-300 to-orange-400 text-white shadow-sm" : "bg-gray-100 text-gray-500",
											].join(" ")}
										>
											{i + 1}
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center justify-between text-sm">
												<span className="text-gray-800 font-medium truncate">{t.team}</span>
												<span className="text-gray-500 text-xs">
													参考 {t.participated} · 通过 {t.passed} ·{" "}
													<span className="text-[#1677ff] font-semibold">{t.pass_rate.toFixed(0)}%</span>
												</span>
											</div>
											<Progress value={t.pass_rate} className="h-2 mt-1.5" />
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="brand-card border-0">
					<CardHeader className="pb-2 flex flex-row items-center justify-between">
						<CardTitle className="text-base flex items-center gap-2">
							<AlertTriangle className="w-4 h-4 text-orange-500" />
							待补考清单
						</CardTitle>
						<Link href="/admin/records?is_pass=false" className="text-xs text-[#1677ff] hover:underline flex items-center gap-0.5">
							查看全部 <ArrowRight className="w-3 h-3" />
						</Link>
					</CardHeader>
					<CardContent className="pt-2 max-h-72 overflow-auto">
						{data.retake_list.length === 0 ? (
							<EmptyState hint="暂无待补考人员" />
						) : (
							<div className="space-y-2">
								{data.retake_list.map((r) => (
									<div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
										<div>
											<div className="text-sm font-medium text-gray-800">{r.candidate_name}</div>
											<div className="text-xs text-gray-500 mt-0.5">{r.team} · {r.phone}</div>
										</div>
										<Badge variant="destructive" className="tabular-nums">
											{r.score} 分
										</Badge>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* 及格率走势 */}
			<Card className="brand-card border-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-base flex items-center gap-2">
						<TrendingUp className="w-4 h-4 text-[#1677ff]" />
						及格率走势
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-2">
					<div className="h-56">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={data.trend.map((t) => ({
									date: t.date.slice(5),
									rate: t.participated > 0 ? Math.round((t.passed / t.participated) * 100) : 0,
								}))}
								margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
								<XAxis dataKey="date" fontSize={12} stroke="#9ca3af" />
								<YAxis fontSize={12} stroke="#9ca3af" domain={[0, 100]} unit="%" />
								<Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }} formatter={(v: number) => `${v}%`} />
								<Line type="monotone" dataKey="rate" stroke="#0958d9" strokeWidth={2.5} dot={{ r: 4, fill: "#1677ff" }} activeDot={{ r: 6 }} />
							</LineChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function EmptyState({ hint }: { hint: string }) {
	return (
		<div className="py-10 text-center text-gray-400 text-sm flex flex-col items-center">
			<BarChart3 className="w-10 h-10 mb-2 opacity-30" />
			{hint}
		</div>
	)
}
