"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, Plus, Pencil, Trash2, Users2, Search, Upload } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"

interface Team {
  id: string
  project_id: string
  project_name: string
  name: string
  leader: string | null
  leader_phone: string | null
  main_work_type: string | null
  member_count: number
  active_worker_count: number
  status: "active" | "disbanded"
  description: string | null
  created_at: string
}

interface ProjectRef {
  id: string
  name: string
}

interface FormState {
  project_id: string
  name: string
  leader: string
  leader_phone: string
  main_work_type: string
  status: Team["status"]
  description: string
}

const EMPTY_FORM: FormState = {
  project_id: "",
  name: "",
  leader: "",
  leader_phone: "",
  main_work_type: "",
  status: "active",
  description: "",
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "在编", className: "bg-green-50 text-green-700 border-green-200" },
  disbanded: { label: "已解散", className: "bg-gray-100 text-gray-600 border-gray-200" },
}

export default function TeamsPage() {
  const [items, setItems] = useState<Team[]>([])
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [projectId, setProjectId] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProjectId, setUploadProjectId] = useState<string>("")
  const [preview, setPreview] = useState<{ name: string; leader: string; leader_phone: string; main_work_type: string; description: string }[]>([])
  const [uploadError, setUploadError] = useState<string>("")
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const loadProjects = useCallback(() => {
    apiGet<{ items: ProjectRef[] }>("/api/projects")
      .then((r) => setProjects(r.items))
      .catch((e: Error) => toast.error(e.message))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (projectId && projectId !== "all") params.set("project_id", projectId)
    if (status && status !== "all") params.set("status", status)
    if (keyword.trim()) params.set("keyword", keyword.trim())
    const q = params.toString()
    apiGet<{ items: Team[] }>(`/api/teams${q ? `?${q}` : ""}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [projectId, status, keyword])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])
  useEffect(() => {
    load()
  }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, project_id: projectId !== "all" ? projectId : (projects[0]?.id ?? "") })
    setDialogOpen(true)
  }
  const openEdit = (t: Team) => {
    setEditing(t)
    setForm({
      project_id: t.project_id,
      name: t.name,
      leader: t.leader ?? "",
      leader_phone: t.leader_phone ?? "",
      main_work_type: t.main_work_type ?? "",
      status: t.status,
      description: t.description ?? "",
    })
    setDialogOpen(true)
  }

  const handleImport = async () => {
    if (!uploadFile || !uploadProjectId) return
    setImporting(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.append("file", uploadFile)
      formData.append("project_id", uploadProjectId)
      const res = await fetch("/api/teams/import", { method: "POST", body: formData })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "导入失败")
      toast.success(`成功导入 ${result.created} 个班组`)
      setUploadOpen(false)
      setUploadFile(null)
      setPreview([])
      load()
    } catch (err: any) {
      setUploadError(err.message || "导入失败")
    } finally {
      setImporting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadError("")
    // 简单预览文件名
    setPreview([{ name: file.name, leader: "", leader_phone: "", main_work_type: "待解析", description: "" }])
  }

  const onSubmit = async () => {
    if (!form.project_id) return toast.error("请选择所属项目")
    if (!form.name.trim()) return toast.error("请填写班组名称")
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/teams/${editing.id}`, form)
        toast.success("已更新")
      } else {
        await apiPost("/api/teams", form)
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
  const onDelete = async (t: Team) => {
    if (!confirm(`确定删除班组 "${t.name}" 吗？`)) return
    try {
      await apiDelete(`/api/teams/${t.id}`)
      toast.success("已删除")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!projectId || projectId === "all") {
      toast.error("请先选择项目")
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("project_id", projectId)
      const res = await fetch("/api/teams/import", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "上传失败")
      toast.success(`成功导入 ${data.count || 0} 个班组`)
      setUploadOpen(false)
      load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const projectOptionMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of projects) m[p.id] = p.name
    return m
  }, [projects])

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto">
      <PageHeader
        title="班组管理"
        subtitle="按项目组织班组结构，班组是培训覆盖统计的基础单元"
        icon={<Users2 className="w-5 h-5" />}
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(true)} className="gap-1.5" disabled={projects.length === 0}>
              <Upload className="w-4 h-4" />
              导入班组
            </Button>
            <Button onClick={openAdd} className="gap-1.5" disabled={projects.length === 0}>
              <Plus className="w-4 h-4" />
              新增班组
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex items-center gap-2 md:min-w-[200px]">
            <Label className="text-xs text-gray-500 whitespace-nowrap">项目</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="全部项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 md:min-w-[160px]">
            <Label className="text-xs text-gray-500 whitespace-nowrap">状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">在编</SelectItem>
                <SelectItem value="disbanded">已解散</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <Input
              placeholder="搜索班组名称/组长/主工种"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
            <Button variant="secondary" onClick={load}>查询</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-gray-400">暂无班组，先在上方选择项目再新增</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>班组</TableHead>
                  <TableHead className="hidden md:table-cell">所属项目</TableHead>
                  <TableHead className="hidden md:table-cell">主工种</TableHead>
                  <TableHead>班组长</TableHead>
                  <TableHead>在册人数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[140px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className="hover:bg-blue-50/40">
                    <TableCell>
                      <div className="font-medium text-gray-900">{t.name}</div>
                      {t.description && <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">{t.description}</div>}
                      <div className="md:hidden text-xs text-gray-500 mt-1">
                        {t.project_name}{t.main_work_type ? ` · ${t.main_work_type}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">{t.project_name || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">{t.main_work_type || "-"}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {t.leader || "-"}
                      {t.leader_phone && <div className="text-xs text-gray-400">{t.leader_phone}</div>}
                    </TableCell>
                    <TableCell className="text-blue-600 font-medium">{t.active_worker_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_MAP[t.status]?.className}>{STATUS_MAP[t.status]?.label ?? t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onDelete(t)}><Trash2 className="w-4 h-4" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "编辑班组" : "新增班组"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label>所属项目 <span className="text-red-500">*</span></Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="请选择项目" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && projectOptionMap[form.project_id] === undefined && (
                <p className="text-xs text-amber-600">原项目已被删除，请重新选择</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>班组名称 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：架子工一班" />
            </div>
            <div className="space-y-1.5">
              <Label>主要工种</Label>
              <Input value={form.main_work_type} onChange={(e) => setForm({ ...form, main_work_type: e.target.value })} placeholder="如：架子工" />
            </div>
            <div className="space-y-1.5">
              <Label>班组长</Label>
              <Input value={form.leader} onChange={(e) => setForm({ ...form, leader: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>班组长手机</Label>
              <Input value={form.leader_phone} onChange={(e) => setForm({ ...form, leader_phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Team["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">在编</SelectItem>
                  <SelectItem value="disbanded">已解散</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>备注</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      {/* 导入班组对话框 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              导入班组
            </DialogTitle>
            <DialogDescription>
              上传 Excel/CSV 文档，自动识别并生成班组
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>选择项目 <span className="text-red-500">*</span></Label>
              <Select value={uploadProjectId} onValueChange={setUploadProjectId}>
                <SelectTrigger><SelectValue placeholder="请选择项目" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>上传文件</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="team-upload"
                />
                <label htmlFor="team-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {uploadFile ? uploadFile.name : "点击上传 Excel/CSV 文件"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    支持 .xlsx、.xls、.csv 格式
                  </p>
                </label>
              </div>
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <Label>预览（前 5 条）</Label>
                <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {preview.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="text-xs text-gray-600 py-1">
                      {idx + 1}. {item.name} - {item.main_work_type || "未分工种"}
                    </div>
                  ))}
                  {preview.length > 5 && (
                    <div className="text-xs text-gray-400 mt-1">
                      ...还有 {preview.length - 5} 条
                    </div>
                  )}
                </div>
              </div>
            )}

            {uploadError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">
                {uploadError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => { setUploadOpen(false); setUploadFile(null); setPreview([]); setUploadError(""); }}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={!uploadFile || !uploadProjectId || importing}>
              {importing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
