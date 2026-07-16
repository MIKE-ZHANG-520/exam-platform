"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, Plus, Pencil, Trash2, FolderKanban, MapPin, User, Search } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"

interface Project {
  id: string
  name: string
  code: string | null
  location: string | null
  manager: string | null
  manager_phone: string | null
  start_date: string | null
  end_date: string | null
  status: "active" | "paused" | "finished" | "archived"
  description: string | null
  team_count: number
  worker_count: number
  created_at: string
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "进行中", className: "bg-green-50 text-green-700 border-green-200" },
  paused: { label: "暂停", className: "bg-amber-50 text-amber-700 border-amber-200" },
  finished: { label: "已竣工", className: "bg-blue-50 text-blue-700 border-blue-200" },
  archived: { label: "已归档", className: "bg-gray-100 text-gray-600 border-gray-200" },
}

interface FormState {
  name: string
  code: string
  location: string
  manager: string
  manager_phone: string
  start_date: string
  end_date: string
  status: Project["status"]
  description: string
}

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  location: "",
  manager: "",
  manager_phone: "",
  start_date: "",
  end_date: "",
  status: "active",
  description: "",
}

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>("all")
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status && status !== "all") params.set("status", status)
    if (keyword.trim()) params.set("keyword", keyword.trim())
    const q = params.toString()
    apiGet<{ items: Project[] }>(`/api/projects${q ? `?${q}` : ""}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [status, keyword])

  useEffect(() => {
    load()
  }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: Project) => {
    setEditing(p)
    setForm({
      name: p.name,
      code: p.code ?? "",
      location: p.location ?? "",
      manager: p.manager ?? "",
      manager_phone: p.manager_phone ?? "",
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
      status: p.status,
      description: p.description ?? "",
    })
    setDialogOpen(true)
  }

  const onSubmit = async () => {
    if (!form.name.trim()) return toast.error("请填写项目名称")
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/projects/${editing.id}`, form)
        toast.success("已更新")
      } else {
        await apiPost("/api/projects", form)
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

  const onDelete = async (p: Project) => {
    if (!confirm(`确定删除项目 "${p.name}" 吗？该操作不可撤销。`)) return
    try {
      await apiDelete(`/api/projects/${p.id}`)
      toast.success("已删除")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto">
      <PageHeader
        title="项目管理"
        subtitle="维护公司在建工程/工地信息，班组与工人在项目下管理"
        icon={<FolderKanban className="w-5 h-5" />}
        right={
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="w-4 h-4" />
            新增项目
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex items-center gap-2 md:min-w-[180px]">
            <Label className="text-xs text-gray-500 whitespace-nowrap">状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">进行中</SelectItem>
                <SelectItem value="paused">暂停</SelectItem>
                <SelectItem value="finished">已竣工</SelectItem>
                <SelectItem value="archived">已归档</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <Input
              placeholder="搜索项目名称/编号/所在地"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load()
              }}
            />
            <Button variant="secondary" onClick={load}>查询</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-gray-400">暂无项目，点击右上角新增</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>项目名称</TableHead>
                  <TableHead className="hidden md:table-cell">编号</TableHead>
                  <TableHead className="hidden lg:table-cell">所在地</TableHead>
                  <TableHead className="hidden md:table-cell">负责人</TableHead>
                  <TableHead className="hidden lg:table-cell">开工/竣工</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>班组/工人</TableHead>
                  <TableHead className="w-[140px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className="hover:bg-blue-50/40">
                    <TableCell>
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">{p.description}</div>}
                      <div className="md:hidden text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {p.code && <span>{p.code}</span>}
                        {p.manager && <span className="flex items-center gap-0.5"><User className="w-3 h-3" />{p.manager}</span>}
                        {p.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{p.location}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">{p.code || "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600">{p.location || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">
                      {p.manager || "-"}
                      {p.manager_phone && <div className="text-xs text-gray-400">{p.manager_phone}</div>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-500 whitespace-nowrap">
                      {p.start_date || "-"}
                      <div className="text-xs text-gray-400">{p.end_date || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_MAP[p.status]?.className}>
                        {STATUS_MAP[p.status]?.label ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-gray-900 font-medium">{p.team_count}</span>
                      <span className="text-gray-400 mx-0.5">/</span>
                      <span className="text-blue-600 font-medium">{p.worker_count}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onDelete(p)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑项目" : "新增项目"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label>项目名称 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：某某广场二期工程" />
            </div>
            <div className="space-y-1.5">
              <Label>项目编号</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="选填，唯一" />
            </div>
            <div className="space-y-1.5">
              <Label>所在地</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="如：上海市浦东新区" />
            </div>
            <div className="space-y-1.5">
              <Label>负责人姓名</Label>
              <Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>负责人手机</Label>
              <Input value={form.manager_phone} onChange={(e) => setForm({ ...form, manager_phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>开工日期</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>竣工日期</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Project["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">进行中</SelectItem>
                  <SelectItem value="paused">暂停</SelectItem>
                  <SelectItem value="finished">已竣工</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>项目描述</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="选填，方便后续查找" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={onSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editing ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
