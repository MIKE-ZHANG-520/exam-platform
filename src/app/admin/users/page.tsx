"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { apiGet, apiPost, apiPatch, apiDelete, fmtDate } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Pencil, Users, ShieldCheck, User as UserIcon } from "lucide-react"

interface User {
	id: string
	username: string
	real_name: string | null
	role: "admin" | "user"
	department: string | null
	disabled: boolean
	created_at: string
}

export default function UsersPage() {
	const [items, setItems] = useState<User[]>([])
	const [loading, setLoading] = useState(true)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<User | null>(null)
	const [saving, setSaving] = useState(false)
	const [form, setForm] = useState<{ username: string; password: string; real_name: string; role: "admin" | "user"; department: string }>({
		username: "",
		password: "",
		real_name: "",
		role: "user",
		department: "",
	})

	const load = useCallback(() => {
		setLoading(true)
		apiGet<{ items: User[] }>("/api/users")
			.then((r) => setItems(r.items))
			.catch((e: Error) => toast.error(e.message))
			.finally(() => setLoading(false))
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const openAdd = () => {
		setEditing(null)
		setForm({ username: "", password: "", real_name: "", role: "user", department: "" })
		setDialogOpen(true)
	}
	const openEdit = (u: User) => {
		setEditing(u)
		setForm({ username: u.username, password: "", real_name: u.real_name || "", role: u.role, department: u.department || "" })
		setDialogOpen(true)
	}

	const onSubmit = async () => {
		if (!form.username.trim()) return toast.error("请填写用户名")
		if (!editing && !form.password) return toast.error("请设置密码")
		setSaving(true)
		try {
			if (editing) {
				const body: Record<string, unknown> = {
					real_name: form.real_name,
					role: form.role,
					department: form.department,
				}
				if (form.password) body.password = form.password
				await apiPatch(`/api/users/${editing.id}`, body)
				toast.success("已更新")
			} else {
				await apiPost("/api/users", form)
				toast.success("已创建")
			}
			setDialogOpen(false)
			load()
		} catch (e) {
			toast.error((e as Error).message)
		} finally {
			setSaving(false)
		}
	}

	const onDelete = async (u: User) => {
		if (!confirm(`确认删除用户 ${u.username}？`)) return
		try {
			await apiDelete(`/api/users/${u.id}`)
			toast.success("已删除")
			load()
		} catch (e) {
			toast.error((e as Error).message)
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<div>
					<h1 className="text-[22px] font-semibold text-gray-900">用户管理</h1>
					<p className="text-sm text-gray-500 mt-0.5">管理系统账号，仅超级管理员可操作</p>
				</div>
				<Button onClick={openAdd} className="bg-[#1677ff] hover:bg-[#0958d9]">
					<Plus className="mr-1 h-4 w-4" /> 新增用户
				</Button>
			</div>

			<Card className="brand-card border-0">
				<CardContent className="p-0">
					{loading ? (
						<div className="p-6 space-y-2">
							{Array.from({ length: 4 }).map((_, i) => (
								<div key={i} className="skeleton h-10 rounded" />
							))}
						</div>
					) : items.length === 0 ? (
						<div className="py-16 flex flex-col items-center">
							<div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-3">
								<Users className="w-7 h-7 text-[#1677ff]" />
							</div>
							<p className="text-sm text-gray-500">暂无用户</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="bg-gray-50/60">
									<TableHead>用户名</TableHead>
									<TableHead>姓名</TableHead>
									<TableHead>角色</TableHead>
									<TableHead>部门/班组</TableHead>
									<TableHead>状态</TableHead>
									<TableHead>创建时间</TableHead>
									<TableHead className="text-right">操作</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((u, i) => (
									<TableRow key={u.id} className={i % 2 === 1 ? "bg-gray-50/30" : ""}>
										<TableCell className="font-medium text-gray-900">{u.username}</TableCell>
										<TableCell>{u.real_name || "-"}</TableCell>
										<TableCell>
											{u.role === "admin" ? (
												<Badge className="bg-blue-50 text-[#1677ff] border border-blue-200">
													<ShieldCheck className="w-3 h-3 mr-1" />超级管理员
												</Badge>
											) : (
												<Badge variant="outline" className="text-gray-600">
													<UserIcon className="w-3 h-3 mr-1" />普通管理员
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-gray-600">{u.department || "-"}</TableCell>
										<TableCell>
											{u.disabled ? (
												<span className="text-xs text-gray-400">已禁用</span>
											) : (
												<span className="text-xs text-emerald-600">正常</span>
											)}
										</TableCell>
										<TableCell className="text-gray-500">{fmtDate(u.created_at)}</TableCell>
										<TableCell className="text-right">
											<Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="hover:text-[#1677ff]">
												<Pencil className="w-4 h-4" />
											</Button>
											<Button variant="ghost" size="sm" onClick={() => onDelete(u)} className="text-red-500 hover:bg-red-50">
												<Trash2 className="w-4 h-4" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editing ? "编辑用户" : "新增用户"}</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div>
							<Label className="mb-1.5 block">用户名</Label>
							<Input value={form.username} disabled={!!editing} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="登录账号" />
						</div>
						<div>
							<Label className="mb-1.5 block">{editing ? "重置密码（留空不改）" : "密码"}</Label>
							<Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? "留空不修改" : "设置初始密码"} />
						</div>
						<div>
							<Label className="mb-1.5 block">真实姓名</Label>
							<Input value={form.real_name} onChange={(e) => setForm({ ...form, real_name: e.target.value })} placeholder="真实姓名" />
						</div>
						<div>
							<Label className="mb-1.5 block">角色</Label>
							<Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "admin" | "user" })}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="admin">超级管理员（全部权限）</SelectItem>
									<SelectItem value="user">普通管理员（仅自己数据）</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label className="mb-1.5 block">部门 / 班组</Label>
							<Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="例如：一车间A班" />
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
						<Button onClick={onSubmit} disabled={saving} className="bg-[#1677ff] hover:bg-[#0958d9]">
							{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}保存
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
