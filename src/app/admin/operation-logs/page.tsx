"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, fmtDate } from "@/lib/http";
import {
	Loader2,
	FileText,
	Trash2,
	Upload,
	Download,
	Plus,
	User,
	LogIn,
	LogOut,
	Search,
	Calendar,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";

interface OperationLog {
	id: string;
	user_id: string | null;
	user_name: string | null;
	action: string;
	target_type: string | null;
	target_id: string | null;
	detail: Record<string, unknown> | null;
	ip_address: string | null;
	created_at: string;
}

// 操作类型映射
const ACTION_MAP: Record<string, { label: string; icon: typeof FileText; color: string }> = {
	login: { label: "登录", icon: LogIn, color: "bg-blue-100 text-blue-700 border-blue-200" },
	logout: { label: "登出", icon: LogOut, color: "bg-gray-100 text-gray-700 border-gray-200" },
	material_upload: { label: "上传材料", icon: Upload, color: "bg-green-100 text-green-700 border-green-200" },
	material_delete: { label: "删除材料", icon: Trash2, color: "bg-red-100 text-red-700 border-red-200" },
	bank_create: { label: "创建题库", icon: Plus, color: "bg-green-100 text-green-700 border-green-200" },
	bank_delete: { label: "删除题库", icon: Trash2, color: "bg-red-100 text-red-700 border-red-200" },
	question_generate: { label: "生成题目", icon: FileText, color: "bg-purple-100 text-purple-700 border-purple-200" },
	exam_create: { label: "创建试卷", icon: Plus, color: "bg-green-100 text-green-700 border-green-200" },
	exam_delete: { label: "删除试卷", icon: Trash2, color: "bg-red-100 text-red-700 border-red-200" },
	worker_import: { label: "导入花名册", icon: Upload, color: "bg-green-100 text-green-700 border-green-200" },
	user_create: { label: "创建用户", icon: User, color: "bg-green-100 text-green-700 border-green-200" },
	user_delete: { label: "删除用户", icon: Trash2, color: "bg-red-100 text-red-700 border-red-200" },
};

export default function OperationLogsPage() {
	const [logs, setLogs] = useState<OperationLog[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [pageSize] = useState(20);

	// 筛选条件
	const [actionFilter, setActionFilter] = useState<string>("");
	const [userFilter, setUserFilter] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");

	const fetchLogs = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			params.set("page", String(page));
			params.set("pageSize", String(pageSize));
			if (actionFilter) params.set("action", actionFilter);
			if (userFilter) params.set("user_id", userFilter);
			if (startDate) params.set("start_date", startDate);
			if (endDate) params.set("end_date", endDate);

			const res = await apiGet<{ items: OperationLog[]; total: number }>(`/api/operation-logs?${params.toString()}`);
			setLogs(res.items || []);
			setTotal(res.total || 0);
		} catch {
			setLogs([]);
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, actionFilter, userFilter, startDate, endDate]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	const totalPages = Math.ceil(total / pageSize);

	const getActionInfo = (action: string) => {
		return ACTION_MAP[action] || { label: action, icon: FileText, color: "bg-gray-100 text-gray-700 border-gray-200" };
	};

	return (
		<div className="space-y-6">
			<PageHeader
				icon={<FileText className="w-5 h-5" />}
				title="操作日志"
				description="记录系统中所有关键操作，便于审计和追溯"
			/>

			{/* 筛选区 */}
			<div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2">
						<Search className="w-4 h-4 text-gray-400" />
						<Select value={actionFilter} onValueChange={setActionFilter}>
							<SelectTrigger className="w-[140px] h-9">
								<SelectValue placeholder="操作类型" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">全部</SelectItem>
								<SelectItem value="login">登录</SelectItem>
								<SelectItem value="logout">登出</SelectItem>
								<SelectItem value="material_upload">上传材料</SelectItem>
								<SelectItem value="material_delete">删除材料</SelectItem>
								<SelectItem value="exam_create">创建试卷</SelectItem>
								<SelectItem value="exam_delete">删除试卷</SelectItem>
								<SelectItem value="worker_import">导入花名册</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center gap-2">
						<User className="w-4 h-4 text-gray-400" />
						<Input
							placeholder="用户ID"
							value={userFilter}
							onChange={(e) => setUserFilter(e.target.value)}
							className="w-[120px] h-9"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Calendar className="w-4 h-4 text-gray-400" />
						<Input
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
							className="w-[140px] h-9"
							placeholder="开始日期"
						/>
						<span className="text-gray-400">-</span>
						<Input
							type="date"
							value={endDate}
							onChange={(e) => setEndDate(e.target.value)}
							className="w-[140px] h-9"
							placeholder="结束日期"
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setActionFilter("");
							setUserFilter("");
							setStartDate("");
							setEndDate("");
							setPage(1);
						}}
					>
						重置
					</Button>
				</div>
			</div>

			{/* 表格 */}
			<div className="bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-200/50 overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
							<tr>
								<th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">时间</th>
								<th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">用户</th>
								<th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
								<th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">详情</th>
								<th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">IP</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-100">
							{loading ? (
								<tr>
									<td colSpan={5} className="px-4 py-12 text-center">
										<Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto mb-2" />
										<p className="text-sm text-gray-500">加载中...</p>
									</td>
								</tr>
							) : logs.length === 0 ? (
								<tr>
									<td colSpan={5} className="px-4 py-12 text-center">
										<div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
											<FileText className="w-6 h-6 text-gray-400" />
										</div>
										<p className="text-sm text-gray-500">暂无操作日志</p>
									</td>
								</tr>
							) : (
								logs.map((log) => {
									const actionInfo = getActionInfo(log.action);
									const ActionIcon = actionInfo.icon;
									return (
										<tr key={log.id} className="hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-colors">
											<td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
												{fmtDate(log.created_at)}
											</td>
											<td className="px-4 py-3 text-sm text-gray-900">
												{log.user_name || log.user_id || "-"}
											</td>
											<td className="px-4 py-3">
												<Badge className={`${actionInfo.color} border text-xs`}>
													<ActionIcon className="w-3 h-3 mr-1" />
													{actionInfo.label}
												</Badge>
											</td>
											<td className="px-4 py-3 text-sm text-gray-600">
												{log.target_type && (
													<span className="text-gray-500">
														{log.target_type}
														{log.target_id && ` #${log.target_id.slice(0, 8)}`}
													</span>
												)}
												{log.detail && Object.keys(log.detail).length > 0 && (
													<span className="ml-2 text-xs text-gray-400">
														{JSON.stringify(log.detail).slice(0, 50)}...
													</span>
												)}
											</td>
											<td className="px-4 py-3 text-sm text-gray-500 font-mono">
												{log.ip_address || "-"}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

				{/* 分页 */}
				{totalPages > 1 && (
					<div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
						<div className="text-sm text-gray-500">
							共 {total} 条记录，第 {page}/{totalPages} 页
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => setPage(page - 1)}
							>
								<ChevronLeft className="w-4 h-4 mr-1" />
								上一页
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= totalPages}
								onClick={() => setPage(page + 1)}
							>
								下一页
								<ChevronRight className="w-4 h-4 ml-1" />
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
