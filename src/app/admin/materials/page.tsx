"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { apiDelete, apiGet, apiPatch, apiPost, fmtDate } from "@/lib/http"
import { toast } from "sonner"
import {
	Loader2,
	Upload,
	Trash2,
	FileText,
	Sparkles,
	ListTree,
	ArrowRight,
	Inbox,
	CloudUpload,
	CheckCircle2,
	RefreshCw,
	Search,
	Filter,
	Eye,
	Calendar,
	HardDrive,
} from "lucide-react"
import Link from "next/link"
import { parsePDFFromFile } from "@/lib/pdf-parser"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/admin/page-header"

interface Material {
	id: string
	title: string
	file_name: string
	file_type: string
	file_size: number
	status: string
	error_message: string | null
	created_at: string
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
	pending: { label: "待解析", className: "bg-slate-100 text-slate-600 border-slate-200" },
	uploaded: { label: "已上传", className: "bg-blue-50 text-blue-600 border-blue-200" },
	parsing: { label: "解析中", className: "bg-amber-50 text-amber-700 border-amber-200" },
	parsed: { label: "已解析", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
	generating: { label: "生成中", className: "bg-violet-50 text-violet-700 border-violet-200" },
	ready: { label: "已就绪", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
	failed: { label: "失败", className: "bg-red-50 text-red-700 border-red-200" },
}

export default function MaterialsPage() {
	const router = useRouter()
	const [items, setItems] = useState<Material[]>([])
	const [loading, setLoading] = useState(true)
	const [uploading, setUploading] = useState(false)
	const [parsingStatus, setParsingStatus] = useState<{ materialId: string; progress: string } | null>(null)
	const [drag, setDrag] = useState(false)
	const [search, setSearch] = useState("")
	const [statusFilter, setStatusFilter] = useState<string>("all")
	const [userRole, setUserRole] = useState<string>("")
	const fileRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		apiGet<{ role: string }>("/api/auth/me").then((r) => setUserRole(r.role)).catch(() => {})
	}, [])

	const load = useCallback(() => {
		setLoading(true)
		apiGet<{ items: Material[] }>("/api/materials")
			.then((r) => setItems(r.items))
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const pollParseStatus = async (materialId: string) => {
		const maxAttempts = 150
		let attempts = 0

		while (attempts < maxAttempts) {
			await new Promise((r) => setTimeout(r, 2000))
			attempts++

			try {
				const res = await apiGet<{ material: Material }>(`/api/materials/${materialId}`)
				const status = res.material.status

				if (status === "parsed" || status === "ready") {
					setParsingStatus({ materialId, progress: "解析完成" })
					return true
				} else if (status === "failed") {
					toast.error(`解析失败：${res.material.error_message || "未知错误"}`)
					return false
				} else if (status === "parsing") {
					const elapsed = attempts * 2
					const progressMsg = elapsed < 60
						? `正在解析... (${elapsed}秒)`
						: `正在解析... (${Math.floor(elapsed / 60)}分${elapsed % 60}秒)，大文件可能需要几分钟，请耐心等待`
					setParsingStatus({ materialId, progress: progressMsg })
				}
			} catch {
				// 忽略单次轮询错误
			}
		}

		toast.error("解析超时，请稍后刷新页面查看状态")
		return false
	}

	const onUpload = async (file: File) => {
		setUploading(true)
		setParsingStatus(null)
		try {
			const fd = new FormData()
			fd.append("file", file)
			const res = await apiPost<{ material: { id: string }; externalParse?: boolean }>("/api/materials", fd)
			const materialId = res.material.id

			if (res.externalParse) {
				toast.success("上传成功，文件将自动解析，请稍后查看")
				router.push(`/admin/materials/${materialId}`)
				return
			}

			const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")

			if (isPDF) {
				toast.success("上传成功，正在解析 PDF 内容...")
				setParsingStatus({ materialId, progress: "开始解析 PDF..." })

				try {
					const result = await parsePDFFromFile(
						file,
						(progress) => {
							setParsingStatus({
								materialId,
								progress: `正在解析 PDF... 第 ${progress.currentPage}/${progress.totalPages} 页 (${progress.percent}%)`,
							})
						},
					)

					if (!result.text || result.text.length < 10) {
						throw new Error("PDF 文本提取失败，内容过少或为扫描件（图片PDF无法提取文字）")
					}

					setParsingStatus({ materialId, progress: "保存解析结果..." })

					await apiPost(`/api/materials/${materialId}/save-parse`, {
						text: result.text,
						pageCount: result.pageCount,
						wordCount: result.wordCount,
						charCount: result.charCount,
					})

					toast.success("PDF 解析完成！即将跳转到详情页...")
					setTimeout(() => {
						router.push(`/admin/materials/${materialId}`)
					}, 1000)
				} catch (parseErr) {
					const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
					toast.error(`PDF 解析失败：${errMsg}`)
					await apiPatch(`/api/materials/${materialId}`, {
						status: "failed",
						error_message: `PDF解析失败：${errMsg}`,
					}).catch(() => {})
					load()
				}
			} else {
				toast.success("上传成功，正在解析文件内容...")
				setParsingStatus({ materialId, progress: "开始解析..." })

				apiPost(`/api/materials/${materialId}/parse`, {}).catch(() => {})

				const success = await pollParseStatus(materialId)

				if (success) {
					toast.success("解析完成！即将跳转到详情页...")
					setTimeout(() => {
						router.push(`/admin/materials/${materialId}`)
					}, 1000)
				} else {
					load()
				}
			}
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setUploading(false)
			setParsingStatus(null)
			if (fileRef.current) fileRef.current.value = ""
		}
	}

	const onDelete = async (id: string) => {
		try {
			await apiDelete(`/api/materials/${id}`)
			toast.success("已删除")
			load()
		} catch (e) {
			toast.error((e as Error).message)
		}
	}

	const filtered = items.filter((m) => {
		if (statusFilter !== "all" && m.status !== statusFilter) return false
		if (search && !m.title.toLowerCase().includes(search.toLowerCase()) && !m.file_name.toLowerCase().includes(search.toLowerCase())) return false
		return true
	})

	const formatFileSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	const getFileIcon = (type: string) => {
		const iconClass = "w-5 h-5"
		switch (type.toLowerCase()) {
			case "pdf":
				return <FileText className={`${iconClass} text-red-500`} />
			case "docx":
			case "doc":
				return <FileText className={`${iconClass} text-blue-600`} />
			case "xlsx":
			case "xls":
				return <FileText className={`${iconClass} text-green-600`} />
			case "pptx":
			case "ppt":
				return <FileText className={`${iconClass} text-orange-500`} />
			default:
				return <FileText className={`${iconClass} text-gray-500`} />
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="培训材料" description="支持 docx / xlsx / pdf / pptx / md，上传后 AI 自动解析并可生成提纲与题库" />

			{/* 解析进度提示 */}
			{parsingStatus && (
				<div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 flex items-center gap-3 shadow-sm">
					<Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
					<div className="flex-1">
						<div className="text-sm font-medium text-blue-900">正在解析文件</div>
						<div className="text-xs text-blue-700 mt-0.5">{parsingStatus.progress}</div>
					</div>
					<CheckCircle2 className="w-4 h-4 text-blue-300" />
				</div>
			)}

			{/* 上传区 */}
			<div
				className={[
					"bg-white rounded-xl border-2 border-dashed transition-all shadow-sm",
					drag ? "border-blue-500 bg-blue-50/50 shadow-md" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50/30",
				].join(" ")}
				onDragEnter={(e) => {
					e.preventDefault()
					setDrag(true)
				}}
				onDragOver={(e) => e.preventDefault()}
				onDragLeave={() => setDrag(false)}
				onDrop={(e) => {
					e.preventDefault()
					setDrag(false)
					const f = e.dataTransfer.files?.[0]
					if (f) onUpload(f)
				}}
			>
				<div className="flex items-center gap-5 px-6 py-5">
					<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
						{uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-6 h-6" />}
					</div>
					<div className="flex-1">
						<div className="text-sm font-semibold text-gray-800">拖拽文件到此处或点击上传</div>
						<div className="text-xs text-gray-500 mt-0.5">
							支持 .docx / .xlsx / .pdf / .pptx / .md · 单文件建议不超过 20 MB
						</div>
					</div>
					<input
						ref={fileRef}
						type="file"
						className="hidden"
						accept=".docx,.xlsx,.pdf,.pptx,.md,.txt"
						onChange={(e) => {
							const f = e.target.files?.[0]
							if (f) onUpload(f)
						}}
					/>
					<Button
						onClick={() => fileRef.current?.click()}
						disabled={uploading}
						className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all"
					>
						{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
						选择文件
					</Button>
				</div>
			</div>

			{/* 筛选区 */}
			<div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-sm border border-gray-100">
				<div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
					<Filter className="w-4 h-4" /> 筛选
				</div>
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="搜索材料名称或文件名"
						className="pl-9 h-9 bg-gray-50 border-gray-200 focus:bg-white"
					/>
				</div>
				<div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
					{(["all", "uploaded", "parsed", "failed"] as const).map((s) => (
						<button
							key={s}
							onClick={() => setStatusFilter(s)}
							className={[
								"px-3 h-7 rounded-md text-xs font-medium transition-all",
								statusFilter === s
									? "bg-white text-blue-600 shadow-sm"
									: "text-gray-500 hover:text-gray-800",
							].join(" ")}
						>
							{s === "all" ? "全部" : STATUS_MAP[s]?.label || s}
						</button>
					))}
				</div>
				<div className="ml-auto text-xs text-gray-400">共 {filtered.length} 条记录</div>
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
						<Inbox className="w-7 h-7 text-blue-500" />
					</div>
					<div className="text-base font-semibold text-gray-800">还没有上传培训材料</div>
					<div className="text-sm text-gray-500 mt-1">拖拽或点击上方按钮上传第一份材料</div>
				</div>
			) : (
				<div className="bg-white rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
					{/* 表头 */}
					<div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
						<div className="grid grid-cols-[1fr_120px_100px_100px_120px_180px] gap-4 px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
							<div>材料名称</div>
							<div>文件类型</div>
							<div>大小</div>
							<div>状态</div>
							<div>上传时间</div>
							<div className="text-right">操作</div>
						</div>
					</div>

					{/* 表体 */}
					<div className="divide-y divide-gray-100">
						{filtered.map((m) => {
							const st = STATUS_MAP[m.status] || STATUS_MAP.uploaded
							return (
								<div
									key={m.id}
									className="grid grid-cols-[1fr_120px_100px_100px_120px_180px] gap-4 px-6 py-4 items-center hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-all duration-200 group"
								>
									{/* 名称 */}
									<div className="flex items-center gap-3 min-w-0">
										<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center shrink-0 shadow-sm border border-gray-100">
											{getFileIcon(m.file_type)}
										</div>
										<div className="min-w-0">
											<div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
												{m.title}
											</div>
											<div className="text-xs text-gray-500 truncate mt-0.5">{m.file_name}</div>
										</div>
									</div>

									{/* 类型 */}
									<div className="text-sm text-gray-600 uppercase font-medium">
										{m.file_type}
									</div>

									{/* 大小 */}
									<div className="text-sm text-gray-600 flex items-center gap-1.5">
										<HardDrive className="w-3.5 h-3.5 text-gray-400" />
										{formatFileSize(m.file_size)}
									</div>

									{/* 状态 */}
									<div>
										<Badge className={`${st.className} text-xs font-medium`}>
											{st.label}
										</Badge>
										{m.status === "failed" && m.error_message && (
											<div className="text-xs text-red-500 mt-1 truncate max-w-[100px]" title={m.error_message}>
												{m.error_message}
											</div>
										)}
									</div>

									{/* 时间 */}
									<div className="text-sm text-gray-500 flex items-center gap-1.5">
										<Calendar className="w-3.5 h-3.5 text-gray-400" />
										{fmtDate(m.created_at)}
									</div>

									{/* 操作 */}
									<div className="flex items-center justify-end gap-2">
										{(m.status === "failed" || m.status === "pending") && (
											<Button
												size="sm"
												variant="outline"
												className="h-8 px-3 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 shadow-sm"
												onClick={async () => {
													try {
														await apiPatch(`/api/materials/${m.id}`, {
															status: "pending",
															error_message: null,
														})
														toast.success("已重新提交解析队列")
														load()
													} catch {
														toast.error("操作失败")
													}
												}}
											>
												<RefreshCw className="w-3.5 h-3.5 mr-1" />
												重试
											</Button>
										)}
										<Link href={`/admin/materials/${m.id}`}>
											<Button
												size="sm"
												className="h-8 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 transition-all hover:-translate-y-0.5"
											>
												<Eye className="w-3.5 h-3.5 mr-1" />
												查看
												<ArrowRight className="w-3.5 h-3.5 ml-1" />
											</Button>
										</Link>
										{m.status === "parsed" && (
											<Button
												size="sm"
												variant="outline"
												className="h-8 px-3 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
												onClick={() => window.open(`/admin/materials/${m.id}/preview`, "_blank")}
											>
												<Eye className="w-3.5 h-3.5 mr-1" />
												预览
											</Button>
										)}
										<Link href={`/admin/banks?material=${m.id}`}>
											<Button
												size="sm"
												variant="outline"
												className="h-8 w-8 p-0 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
												title="查看关联题库"
											>
												<ListTree className="w-4 h-4" />
											</Button>
										</Link>
										{userRole === "admin" && (<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													size="sm"
													variant="outline"
													className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>删除该材料？</AlertDialogTitle>
													<AlertDialogDescription>删除后材料原文以及关联的提纲、题库将全部移除。</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>取消</AlertDialogCancel>
													<AlertDialogAction onClick={() => onDelete(m.id)} className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700">
														确认删除
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>)}
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
