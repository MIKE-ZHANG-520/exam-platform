"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Users,
	Clock,
	CheckCircle2,
	ShieldCheck,
	AlertTriangle,
	Search,
	FileText,
	QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";

interface WorkerProfile {
	id: string;
	worker_id: string;
	worker_name: string;
	id_card_no: string;
	phone: string;
	work_type: string;
	project_name: string;
	team_name: string;
	profile_status: string;
	entry_status: string;
	qr_code_url: string | null;
	certificate_expiry: string | null;
	created_at: string;
}

export default function SafetyManagementPage() {
	const [profiles, setProfiles] = useState<WorkerProfile[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [entryFilter, setEntryFilter] = useState("all");

	useEffect(() => {
		fetchProfiles();
	}, []);

	const fetchProfiles = async () => {
		try {
			const res = await fetch("/api/worker-profiles");
			if (!res.ok) throw new Error("加载失败");
			const data = await res.json();
			setProfiles(data.profiles || []);
		} catch (err) {
			toast.error("加载工人档案失败");
		} finally {
			setLoading(false);
		}
	};

	const filtered = profiles.filter((p) => {
		const matchSearch =
			!search ||
			p.worker_name.toLowerCase().includes(search.toLowerCase()) ||
			p.id_card_no.toLowerCase().includes(search.toLowerCase());
		const matchStatus = statusFilter === "all" || p.profile_status === statusFilter;
		const matchEntry = entryFilter === "all" || p.entry_status === entryFilter;
		return matchSearch && matchStatus && matchEntry;
	});

	const stats = {
		total: profiles.length,
		pending: profiles.filter((p) => p.profile_status === "pending").length,
		approved: profiles.filter((p) => p.profile_status === "approved").length,
		entered: profiles.filter((p) => p.entry_status === "entered").length,
		expiring: profiles.filter((p) => {
			if (!p.certificate_expiry) return false;
			const days = Math.ceil(
				(new Date(p.certificate_expiry).getTime() - Date.now()) / 86400000
			);
			return days >= 0 && days <= 30;
		}).length,
	};

	const getStatusBadge = (status: string) => {
		const map: Record<string, { label: string; className: string }> = {
			pending: { label: "待审核", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
			approved: { label: "已通过", className: "bg-green-100 text-green-700 border-green-200" },
			rejected: { label: "已驳回", className: "bg-red-100 text-red-700 border-red-200" },
			entered: { label: "已入场", className: "bg-blue-100 text-blue-700 border-blue-200" },
		};
		const config = map[status] || { label: status, className: "" };
		return <Badge className={config.className}>{config.label}</Badge>;
	};

	const getEntryBadge = (status: string) => {
		const map: Record<string, { label: string; className: string }> = {
			not_started: { label: "未开始", className: "bg-gray-100 text-gray-700 border-gray-200" },
			training: { label: "培训中", className: "bg-blue-100 text-blue-700 border-blue-200" },
			briefing: { label: "待交底", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
			entered: { label: "已入场", className: "bg-green-100 text-green-700 border-green-200" },
		};
		const config = map[status] || { label: status, className: "" };
		return <Badge className={config.className}>{config.label}</Badge>;
	};

	return (
		<div className="space-y-6">
			<PageHeader
				title="工人安全管理"
				subtitle="入场资料审核 · 三级教育培训 · 入场交底 · 二维码"
				icon={<ShieldCheck className="h-5 w-5" />}
			/>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-5">
				<Card className="p-5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
							<Users className="w-5 h-5 text-blue-600" />
						</div>
						<div>
							<div className="text-2xl font-bold">{stats.total}</div>
							<div className="text-xs text-muted-foreground">总人数</div>
						</div>
					</div>
				</Card>
				<Card className="p-5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
							<Clock className="w-5 h-5 text-yellow-600" />
						</div>
						<div>
							<div className="text-2xl font-bold">{stats.pending}</div>
							<div className="text-xs text-muted-foreground">待审核</div>
						</div>
					</div>
				</Card>
				<Card className="p-5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
							<CheckCircle2 className="w-5 h-5 text-green-600" />
						</div>
						<div>
							<div className="text-2xl font-bold">{stats.approved}</div>
							<div className="text-xs text-muted-foreground">已通过</div>
						</div>
					</div>
				</Card>
				<Card className="p-5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
							<ShieldCheck className="w-5 h-5 text-green-600" />
						</div>
						<div>
							<div className="text-2xl font-bold">{stats.entered}</div>
							<div className="text-xs text-muted-foreground">已入场</div>
						</div>
					</div>
				</Card>
				<Card className="p-5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
							<AlertTriangle className="w-5 h-5 text-red-600" />
						</div>
						<div>
							<div className="text-2xl font-bold">{stats.expiring}</div>
							<div className="text-xs text-muted-foreground">证件即将到期</div>
						</div>
					</div>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-5 w-5" />
							工人档案
						</CardTitle>
						<div className="flex gap-2">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="搜索姓名/身份证..."
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className="pl-9 w-64"
								/>
							</div>
							<Select value={statusFilter} onValueChange={setStatusFilter}>
								<SelectTrigger className="w-32">
									<SelectValue placeholder="审核状态" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">全部状态</SelectItem>
									<SelectItem value="pending">待审核</SelectItem>
									<SelectItem value="approved">已通过</SelectItem>
									<SelectItem value="rejected">已驳回</SelectItem>
								</SelectContent>
							</Select>
							<Select value={entryFilter} onValueChange={setEntryFilter}>
								<SelectTrigger className="w-32">
									<SelectValue placeholder="入场状态" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">全部状态</SelectItem>
									<SelectItem value="not_started">未开始</SelectItem>
									<SelectItem value="training">培训中</SelectItem>
									<SelectItem value="briefing">待交底</SelectItem>
									<SelectItem value="entered">已入场</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
							))}
						</div>
					) : filtered.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
							<Users className="h-12 w-12 mb-3 opacity-50" />
							<p className="text-sm">暂无工人档案数据</p>
							<p className="text-xs mt-1">请先在花名册中添加工人</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>姓名</TableHead>
									<TableHead>工种</TableHead>
									<TableHead>项目/班组</TableHead>
									<TableHead>审核状态</TableHead>
									<TableHead>入场状态</TableHead>
									<TableHead>证件到期</TableHead>
									<TableHead>操作</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((p) => (
									<TableRow key={p.id}>
										<TableCell className="font-medium">{p.worker_name}</TableCell>
										<TableCell>{p.work_type || "-"}</TableCell>
										<TableCell>
											<div className="text-sm">
												<div>{p.project_name || "-"}</div>
												<div className="text-xs text-muted-foreground">{p.team_name || "-"}</div>
											</div>
										</TableCell>
										<TableCell>{getStatusBadge(p.profile_status)}</TableCell>
										<TableCell>{getEntryBadge(p.entry_status)}</TableCell>
										<TableCell>
											{p.certificate_expiry ? (
												<span className="text-sm">
													{new Date(p.certificate_expiry).toLocaleDateString("zh-CN")}
												</span>
											) : (
												"-"
											)}
										</TableCell>
										<TableCell>
											<div className="flex gap-2">
												<Link href={`/admin/workers/${p.worker_id}/profile`}>
													<Button variant="outline" size="sm">
														管理档案
													</Button>
												</Link>
												{p.qr_code_url && (
													<Button variant="ghost" size="sm">
														<QrCode className="h-4 w-4" />
													</Button>
												)}
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
