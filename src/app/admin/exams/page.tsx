"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, apiDelete, fmtDate } from "@/lib/http";
import { toast } from "sonner";
import {
	Plus,
	Loader2,
	ClipboardCheck,
	QrCode,
	Trash2,
	Download,
	ArrowRight,
	Eye,
	Calendar,
	Clock,
	Target,
	RefreshCw,
	Search,
	Filter,
	FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/admin/page-header";

interface Exam {
	id: string;
	title: string;
	bank_id: string;
	paper_type: "A" | "B";
	duration_min: number;
	pass_score: number;
	total_score: number;
	max_attempts: number;
	config: { single: number; multiple: number; judge: number };
	status: string;
	created_at: string;
}

interface Bank {
	id: string;
	title: string;
	difficulty: "easy" | "medium";
	total_count: number;
}

export default function ExamsPage() {
	const [items, setItems] = useState<Exam[]>([]);
	const [banks, setBanks] = useState<Bank[]>([]);
	const [bankMap, setBankMap] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [qrExam, setQrExam] = useState<Exam | null>(null);
	const [qrUrl, setQrUrl] = useState<string>("");
	const [qrLink, setQrLink] = useState<string>("");
	const [search, setSearch] = useState("");
	const [userRole, setUserRole] = useState<string>("");

	const [form, setForm] = useState<{ title: string; paper_type: "A" | "B"; bank_id: string }>({
		title: "",
		paper_type: "A",
		bank_id: "",
	});

	useEffect(() => {
		apiGet<{ role: string }>("/api/auth/me").then((r) => setUserRole(r.role)).catch(() => {});
	}, []);

	const load = useCallback(() => {
		setLoading(true);
		Promise.all([apiGet<{ items: Exam[] }>("/api/exams"), apiGet<{ items: Bank[] }>("/api/banks?status=published")])
			.then(([e, b]) => {
				setItems(e.items);
				setBanks(b.items);
				setBankMap(Object.fromEntries(b.items.map((x) => [x.id, x.title])));
			})
			.catch((err: Error) => toast.error(err.message))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const onCreate = async () => {
		if (!form.title.trim()) {
			toast.error("请输入试卷标题");
			return;
		}
		if (!form.bank_id) {
			toast.error("请选择题库");
			return;
		}
		setCreating(true);
		try {
			await apiPost("/api/exams", form);
			toast.success("试卷创建成功");
			setDialogOpen(false);
			setForm({ title: "", paper_type: "A", bank_id: "" });
			load();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setCreating(false);
		}
	};

	const onDelete = async (id: string) => {
		try {
			await apiDelete(`/api/exams/${id}`);
			toast.success("已删除");
			load();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const openQr = async (exam: Exam) => {
		setQrExam(exam);
		setQrUrl("");
		setQrLink("");
		try {
			const res = await apiGet<{ url: string; data_url: string }>(`/api/exams/${exam.id}/qrcode`);
			setQrUrl(res.data_url);
			setQrLink(res.url);
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const filteredBanks = banks.filter((b) => (form.paper_type === "A" ? b.difficulty === "easy" : b.difficulty === "medium"));

	const filtered = items.filter((e) => {
		if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	});

	return (
		<div className="space-y-6">
			<PageHeader
				title="考试试卷"
				description="配置试卷、生成扫码入口，工人扫码即可参考"
				right={
					<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
						<DialogTrigger asChild>
							<Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all hover:-translate-y-0.5">
								<Plus className="mr-1 h-4 w-4" /> 新建试卷
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>新建试卷</DialogTitle>
								<DialogDescription>
									A 卷（简易）：20题（单选10+判断10）· 20分钟 · 80分及格<br />
									B 卷（中等）：20题（单选8+多选6+判断6）· 30分钟 · 80分及格
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-4 py-2">
								<div>
									<Label className="mb-1.5 block">试卷标题</Label>
									<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：安全生产培训 A 卷" />
								</div>
								<div>
									<Label className="mb-1.5 block">试卷类型</Label>
									<Select value={form.paper_type} onValueChange={(v) => setForm({ ...form, paper_type: v as "A" | "B", bank_id: "" })}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="A">A 卷 · 简易（20题 / 20分钟）</SelectItem>
											<SelectItem value="B">B 卷 · 中等（20题 / 30分钟）</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div>
									<Label className="mb-1.5 block">抽题题库（{form.paper_type === "A" ? "简易" : "中等"}）</Label>
									<Select value={form.bank_id} onValueChange={(v) => setForm({ ...form, bank_id: v })}>
										<SelectTrigger>
											<SelectValue placeholder={filteredBanks.length ? "选择题库" : "无可用题库，请先发布题库"} />
										</SelectTrigger>
										<SelectContent>
											{filteredBanks.map((b) => (
												<SelectItem key={b.id} value={b.id}>
													{b.title}（{b.total_count} 题）
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setDialogOpen(false)}>
									取消
								</Button>
								<Button onClick={onCreate} disabled={creating} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700">
									{creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
									创建
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				}
			/>

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
						placeholder="搜索试卷名称"
						className="pl-9 h-9 bg-gray-50 border-gray-200 focus:bg-white"
					/>
				</div>
				<div className="ml-auto text-xs text-gray-400">共 {filtered.length} 份试卷</div>
			</div>

			{/* 表格 */}
			{loading ? (
				<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
					<div className="p-8 space-y-4">
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className="skeleton h-14 rounded-lg" />
						))}
					</div>
				</div>
			) : filtered.length === 0 ? (
				<div className="bg-white rounded-xl py-16 flex flex-col items-center shadow-sm border border-gray-100">
					<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3 shadow-inner">
						<ClipboardCheck className="w-7 h-7 text-blue-500" />
					</div>
					<div className="text-base font-semibold text-gray-800">还没有试卷</div>
					<div className="text-sm text-gray-500 mt-1">先在题库详情审核发布后，再来这里创建试卷</div>
				</div>
			) : (
				<div className="bg-white rounded-xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
					{/* 表头 */}
					<div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
						<div className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_200px] gap-4 px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
							<div>试卷名称</div>
							<div>类型</div>
							<div>时长</div>
							<div>及格分</div>
							<div>机会</div>
							<div>创建时间</div>
							<div className="text-right">操作</div>
						</div>
					</div>

					{/* 表体 */}
					<div className="divide-y divide-gray-100">
						{filtered.map((exam) => (
							<div
								key={exam.id}
								className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_200px] gap-4 px-6 py-4 items-center hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-all duration-200 group"
							>
								{/* 名称 */}
								<div className="flex items-center gap-3 min-w-0">
									<div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm border ${
										exam.paper_type === "A"
											? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-100"
											: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100"
									}`}>
										<ClipboardCheck className={`w-5 h-5 ${exam.paper_type === "A" ? "text-emerald-600" : "text-blue-600"}`} />
									</div>
									<div className="min-w-0">
										<div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
											{exam.title}
										</div>
										<div className="text-xs text-gray-500 mt-0.5 truncate">
											题库：{bankMap[exam.bank_id] || "(已删除)"}
										</div>
									</div>
								</div>

								{/* 类型 */}
								<div>
									<Badge className={
										exam.paper_type === "A"
											? "bg-emerald-50 text-emerald-700 border-emerald-200"
											: "bg-blue-50 text-blue-700 border-blue-200"
									}>
										{exam.paper_type === "A" ? "A · 简易" : "B · 中等"}
									</Badge>
								</div>

								{/* 时长 */}
								<div className="text-sm text-gray-600 flex items-center gap-1.5">
									<Clock className="w-3.5 h-3.5 text-gray-400" />
									<span className="tabular-nums font-medium">{exam.duration_min}</span>
									<span className="text-gray-400">min</span>
								</div>

								{/* 及格分 */}
								<div className="text-sm text-gray-600 flex items-center gap-1.5">
									<Target className="w-3.5 h-3.5 text-gray-400" />
									<span className="tabular-nums font-medium">{exam.pass_score}</span>
									<span className="text-gray-400">分</span>
								</div>

								{/* 机会 */}
								<div className="text-sm text-gray-600 flex items-center gap-1.5">
									<RefreshCw className="w-3.5 h-3.5 text-gray-400" />
									<span className="tabular-nums font-medium">{exam.max_attempts}</span>
									<span className="text-gray-400">次</span>
								</div>

								{/* 时间 */}
								<div className="text-sm text-gray-500 flex items-center gap-1.5">
									<Calendar className="w-3.5 h-3.5 text-gray-400" />
									{fmtDate(exam.created_at)}
								</div>

								{/* 操作 */}
								<div className="flex items-center justify-end gap-2">
									<Button
										size="sm"
										variant="outline"
										className="h-8 px-3 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 shadow-sm"
										onClick={() => openQr(exam)}
									>
										<QrCode className="w-3.5 h-3.5 mr-1" />
										二维码
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-8 px-3 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 shadow-sm"
										onClick={() => window.open(`/api/exams/${exam.id}/export?answer=true`, "_blank")}
									>
										<Download className="w-3.5 h-3.5 mr-1" />
										答案
									</Button>
									<Link href={`/admin/records?exam_id=${exam.id}`}>
										<Button
											size="sm"
											className="h-8 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 transition-all hover:-translate-y-0.5"
										>
											<Eye className="w-3.5 h-3.5 mr-1" />
											记录
											<ArrowRight className="w-3.5 h-3.5 ml-1" />
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
												<AlertDialogTitle>删除该试卷？</AlertDialogTitle>
												<AlertDialogDescription>已产生的考试记录不受影响。</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>取消</AlertDialogCancel>
												<AlertDialogAction onClick={() => onDelete(exam.id)} className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700">
													确认删除
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* 二维码弹窗 */}
			<Dialog open={!!qrExam} onOpenChange={(v) => !v && setQrExam(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{qrExam?.title}</DialogTitle>
						<DialogDescription>工人扫码即可进入考试</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col items-center gap-3 py-2">
						{qrUrl ? (
							/* eslint-disable-next-line @next/next/no-img-element */
							<img src={qrUrl} alt="qrcode" width={240} height={240} className="rounded-lg border border-gray-200 p-2 bg-white shadow-md" />
						) : (
							<div className="flex h-60 w-60 items-center justify-center text-sm text-gray-500">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...
							</div>
						)}
						<p className="break-all text-center text-xs text-gray-500">{qrLink}</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								navigator.clipboard.writeText(qrLink);
								toast.success("链接已复制");
							}}
						>
							复制链接
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
