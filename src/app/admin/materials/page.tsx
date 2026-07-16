"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiDelete, apiGet, apiPost, fmtDate } from "@/lib/http"
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
} from "lucide-react"
import Link from "next/link"
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
	uploaded: { label: "已上传", className: "bg-blue-50 text-[#1677ff] border-blue-200" },
	parsing: { label: "解析中", className: "bg-amber-50 text-amber-700 border-amber-200" },
	parsed: { label: "已解析", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
	generating: { label: "生成中", className: "bg-amber-50 text-amber-700 border-amber-200" },
	ready: { label: "已就绪", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
	failed: { label: "失败", className: "bg-red-50 text-red-700 border-red-200" },
}

export default function MaterialsPage() {
	const [items, setItems] = useState<Material[]>([])
	const [loading, setLoading] = useState(true)
	const [uploading, setUploading] = useState(false)
	const [drag, setDrag] = useState(false)
	const fileRef = useRef<HTMLInputElement>(null)

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

	const onUpload = async (file: File) => {
		setUploading(true)
		try {
			const fd = new FormData()
			fd.append("file", file)
			const res = await apiPost<{ material: { id: string } }>("/api/materials", fd)
			toast.success("上传成功，正在解析文件内容...")
			apiPost(`/api/materials/${res.material.id}/parse`, {}).catch(() => {})
			setTimeout(load, 1500)
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setUploading(false)
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

	return (
		<div className="space-y-6">
			<PageHeader title="培训材料" description="支持 docx / xlsx / pdf / pptx / md，上传后才子佳人自动解析并可生成提纲与题库" />

			{/* 上传区（拖拽 + 点击） */}
			<div
				className={[
					"brand-card rounded-xl border-2 border-dashed transition-all",
					drag ? "border-[#1677ff] bg-[#eff6ff]" : "border-gray-200 hover:border-[#4096ff] hover:bg-blue-50/30",
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
				<div className="flex items-center gap-5 px-6 py-6">
					<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-white flex items-center justify-center shadow-md">
						{uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CloudUpload className="w-7 h-7" />}
					</div>
					<div className="flex-1">
						<div className="text-[15px] font-medium text-gray-800">拖拽文件到此处或点击上传</div>
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
						className="bg-[#1677ff] hover:bg-[#0958d9] shadow-sm"
					>
						{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
						选择文件
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="skeleton h-40 rounded-xl" />
					))}
				</div>
			) : items.length === 0 ? (
				<div className="brand-card rounded-xl py-16 flex flex-col items-center">
					<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3">
						<Inbox className="w-7 h-7 text-[#1677ff]" />
					</div>
					<div className="text-[15px] font-medium text-gray-800">还没有上传培训材料</div>
					<div className="text-sm text-gray-500 mt-1">拖拽或点击上方按钮上传第一份材料</div>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{items.map((m) => {
						const st = STATUS_MAP[m.status] || STATUS_MAP.uploaded
						return (
							<Card key={m.id} className="brand-card border-0 hover-lift">
								<CardContent className="p-5">
									<div className="flex items-start gap-3">
										<div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
											<FileText className="w-5 h-5 text-[#1677ff]" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-2">
												<div className="text-[14px] font-medium text-gray-900 line-clamp-2 leading-snug">{m.title}</div>
												<Badge variant="outline" className={`${st.className} shrink-0 text-[11px]`}>
													{st.label}
												</Badge>
											</div>
											<div className="text-[11px] text-gray-500 mt-1.5 truncate">{m.file_name}</div>
											<div className="text-[11px] text-gray-400 mt-0.5">
												{(m.file_size / 1024).toFixed(1)} KB · {fmtDate(m.created_at)}
											</div>
										</div>
									</div>

									{m.status === "failed" && m.error_message && (
										<div className="mt-3 rounded-md bg-red-50 border border-red-100 px-2.5 py-1.5 text-[11px] text-red-700">
											{m.error_message}
										</div>
									)}

									<div className="mt-4 flex items-center gap-2">
										<Link href={`/admin/materials/${m.id}`} className="flex-1">
											<Button size="sm" className="w-full bg-[#1677ff] hover:bg-[#0958d9]">
												<Sparkles className="w-3.5 h-3.5 mr-1" />
												查看/才子佳人生成
												<ArrowRight className="w-3.5 h-3.5 ml-auto" />
											</Button>
										</Link>
										<Link href={`/admin/banks?material=${m.id}`}>
											<Button size="sm" variant="outline" title="查看关联题库">
												<ListTree className="w-3.5 h-3.5" />
											</Button>
										</Link>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:border-red-200">
													<Trash2 className="w-3.5 h-3.5" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>删除该材料？</AlertDialogTitle>
													<AlertDialogDescription>删除后材料原文以及关联的提纲、题库将全部移除。</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>取消</AlertDialogCancel>
													<AlertDialogAction onClick={() => onDelete(m.id)} className="bg-red-500 hover:bg-red-600">
														确认删除
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
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
