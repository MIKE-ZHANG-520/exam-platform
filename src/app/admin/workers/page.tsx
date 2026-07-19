"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/http"
import { toast } from "sonner"
import { Loader2, Plus, Pencil, Trash2, Search, UserSquare2, Upload, Download, FileSpreadsheet } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"

interface Worker {
  id: string
  name: string
  id_card_mask: string | null
  phone: string | null
  gender: string | null
  work_type: string | null
  project_id: string | null
  team_id: string | null
  project_name: string | null
  team_name: string | null
  hire_date: string | null
  status: "active" | "resigned" | "seconded"
  created_at: string
}

interface ProjectRef { id: string; name: string }
interface TeamRef { id: string; name: string; project_id: string }

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "在册", className: "bg-green-50 text-green-700 border-green-200" },
  resigned: { label: "离职", className: "bg-gray-100 text-gray-600 border-gray-200" },
  seconded: { label: "借调", className: "bg-blue-50 text-blue-700 border-blue-200" },
}

interface FormState {
  name: string
  id_card: string
  phone: string
  gender: string
  work_type: string
  project_id: string
  team_id: string
  hire_date: string
  status: Worker["status"]
}

const EMPTY_FORM: FormState = {
  name: "",
  id_card: "",
  phone: "",
  gender: "男",
  work_type: "",
  project_id: "",
  team_id: "",
  hire_date: "",
  status: "active",
}

export default function WorkersPage() {
  const [items, setItems] = useState<Worker[]>([])
  const [total, setTotal] = useState(0)
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [teams, setTeams] = useState<TeamRef[]>([])
  const [projectId, setProjectId] = useState("all")
  const [teamId, setTeamId] = useState("all")
  const [status, setStatus] = useState("active")
  const [workType, setWorkType] = useState("")
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // 导入
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    total: number
    success: number
    updated: number
    skipped: number
    errors: Array<{ row: number; reason: string }>
  } | null>(null)
  const [importProjectId, setImportProjectId] = useState<string>("")
  const [importTeamId, setImportTeamId] = useState<string>("")
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (projectId !== "all") params.set("project_id", projectId)
    if (teamId !== "all") params.set("team_id", teamId)
    if (status !== "all") params.set("status", status)
    if (workType.trim()) params.set("work_type", workType.trim())
    if (keyword.trim()) params.set("keyword", keyword.trim())
    params.set("limit", "200")
    apiGet<{ items: Worker[]; total: number }>(`/api/workers?${params.toString()}`)
      .then((r) => {
        setItems(r.items)
        setTotal(r.total)
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [projectId, teamId, status, workType, keyword])

  const loadRefs = useCallback(() => {
    apiGet<{ items: ProjectRef[] }>("/api/projects").then((r) => setProjects(r.items)).catch(() => {})
    apiGet<{ items: TeamRef[] }>("/api/teams").then((r) => setTeams(r.items)).catch(() => {})
  }, [])

  useEffect(() => {
    loadRefs()
  }, [loadRefs])
  useEffect(() => {
    load()
  }, [load])

  const teamOptionsInForm = useMemo(() => teams.filter((t) => !form.project_id || t.project_id === form.project_id), [teams, form.project_id])
  const teamOptionsInFilter = useMemo(() => teams.filter((t) => projectId === "all" || t.project_id === projectId), [teams, projectId])
  const teamOptionsInImport = useMemo(() => teams.filter((t) => !importProjectId || t.project_id === importProjectId), [teams, importProjectId])

  const openAdd = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      project_id: projectId !== "all" ? projectId : "",
      team_id: teamId !== "all" ? teamId : "",
    })
    setDialogOpen(true)
  }
  const openEdit = (w: Worker) => {
    setEditing(w)
    setForm({
      name: w.name,
      id_card: "",
      phone: w.phone ?? "",
      gender: w.gender || "男",
      work_type: w.work_type ?? "",
      project_id: w.project_id ?? "",
      team_id: w.team_id ?? "",
      hire_date: w.hire_date ?? "",
      status: w.status,
    })
    setDialogOpen(true)
  }
  const onSubmit = async () => {
    if (!form.name.trim()) return toast.error("请填写姓名")
    setSaving(true)
    try {
      if (editing) {
        const payload: Partial<FormState> = { ...form }
        if (!payload.id_card) delete payload.id_card
        await apiPatch(`/api/workers/${editing.id}`, payload)
        toast.success("已更新")
      } else {
        if (!form.id_card.trim()) {
          setSaving(false)
          return toast.error("身份证号是唯一主键，必填")
        }
        await apiPost("/api/workers", form)
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
  const onDelete = async (w: Worker) => {
    if (!confirm(`确定删除工人 "${w.name}" 吗？如果只是离职，请改状态为"离职"。`)) return
    try {
      await apiDelete(`/api/workers/${w.id}`)
      toast.success("已删除")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doImport = async () => {
    const f = fileRef.current?.files?.[0]
    if (!f) return toast.error("请先选择文件")
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", f)
      if (importProjectId) fd.append("project_id", importProjectId)
      if (importTeamId) fd.append("team_id", importTeamId)
      const r = await apiPost<{
        total: number
        success: number
        updated: number
        skipped: number
        errors: Array<{ row: number; reason: string }>
      }>("/api/workers/import", fd)
      setImportResult(r)
      toast.success(`导入完成：新增 ${r.success}，更新 ${r.updated}，跳过 ${r.skipped}`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const csv = "\uFEFF姓名,身份证号,手机号,性别,工种,班组,项目,入职日期,状态\n张三,110101199001011234,13800138000,男,架子工,,,2024-03-01,active\n"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "花名册导入模板.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto">
      <PageHeader
        title="花名册"
        subtitle={`共 ${total} 名工人 · 身份证号加密存储 · 支持 Excel/CSV 批量导入`}
        icon={<UserSquare2 className="w-5 h-5" />}
        right={
          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              批量导入
            </Button>
            <Button onClick={openAdd} className="gap-1.5">
              <Plus className="w-4 h-4" />
              新增工人
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs text-gray-500">项目</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTeamId("all") }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">班组</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部班组</SelectItem>
                {teamOptionsInFilter.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">在册</SelectItem>
                <SelectItem value="seconded">借调</SelectItem>
                <SelectItem value="resigned">离职</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">工种</Label>
            <Input className="mt-1" value={workType} onChange={(e) => setWorkType(e.target.value)} placeholder="如：电工" onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <div className="col-span-2 md:col-span-2">
            <Label className="text-xs text-gray-500">搜索</Label>
            <div className="flex items-center gap-2 mt-1">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="姓名/手机/身份证后 4 位" onKeyDown={(e) => e.key === "Enter" && load()} />
              <Button size="sm" variant="secondary" onClick={load}>查询</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-gray-400">暂无工人，可点击"批量导入"上传花名册</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead className="hidden md:table-cell">身份证</TableHead>
                  <TableHead className="hidden lg:table-cell">手机</TableHead>
                  <TableHead className="hidden md:table-cell">工种</TableHead>
                  <TableHead className="hidden lg:table-cell">项目/班组</TableHead>
                  <TableHead className="hidden xl:table-cell">入职</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => (
                  <TableRow key={w.id} className="hover:bg-blue-50/40">
                    <TableCell>
                      <div className="font-medium text-gray-900">{w.name}</div>
                      <div className="md:hidden text-xs text-gray-500 mt-1 space-y-0.5">
                        {w.id_card_mask && <div>{w.id_card_mask}</div>}
                        {w.work_type && <div>{w.work_type}{w.phone ? ` · ${w.phone}` : ""}</div>}
                        {(w.project_name || w.team_name) && <div>{w.project_name}{w.team_name ? ` · ${w.team_name}` : ""}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600 font-mono">{w.id_card_mask || "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600">{w.phone || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-600">{w.work_type || "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                      {w.project_name || "-"}
                      {w.team_name && <div className="text-xs text-gray-400">{w.team_name}</div>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm text-gray-500 whitespace-nowrap">{w.hire_date || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_MAP[w.status]?.className}>{STATUS_MAP[w.status]?.label ?? w.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(w)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onDelete(w)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 单人 CRUD */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? `编辑：${editing.name}` : "新增工人"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>姓名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>身份证号 {!editing && <span className="text-red-500">*</span>}</Label>
              <Input value={form.id_card} onChange={(e) => setForm({ ...form, id_card: e.target.value })} placeholder={editing ? `${editing.id_card_mask ?? ""}（如需修改请填写完整号码）` : "18 位身份证号，加密存储"} />
            </div>
            <div className="space-y-1.5">
              <Label>手机</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>性别</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="选填" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="男">男</SelectItem>
                  <SelectItem value="女">女</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>工种</Label>
              <Input value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value })} placeholder="如：架子工/电工/塔司" />
            </div>
            <div className="space-y-1.5">
              <Label>入职日期</Label>
              <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>所属项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v, team_id: "" })}>
                <SelectTrigger><SelectValue placeholder="选填" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>所属班组</Label>
              <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v })} disabled={!form.project_id}>
                <SelectTrigger><SelectValue placeholder={form.project_id ? "选填" : "先选项目"} /></SelectTrigger>
                <SelectContent>
                  {teamOptionsInForm.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Worker["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">在册</SelectItem>
                  <SelectItem value="seconded">借调</SelectItem>
                  <SelectItem value="resigned">离职</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Excel 导入 */}
      <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>批量导入花名册</DialogTitle>
            <DialogDescription>支持 Excel（.xlsx/.xls）和 CSV，自动识别中英文列名，按身份证号去重更新。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>默认项目（可选）</Label>
                <Select value={importProjectId} onValueChange={(v) => { setImportProjectId(v); setImportTeamId("") }}>
                  <SelectTrigger><SelectValue placeholder="不指定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不指定（读表内列）</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>默认班组（可选）</Label>
                <Select value={importTeamId} onValueChange={setImportTeamId} disabled={!importProjectId}>
                  <SelectTrigger><SelectValue placeholder="不指定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不指定</SelectItem>
                    {teamOptionsInImport.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-3 hover:border-blue-400 transition-colors">
              <FileSpreadsheet className="w-8 h-8 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="text-sm w-full" />
                <div className="text-xs text-gray-400 mt-1">识别列名：姓名、身份证号、手机号、性别、工种、班组、项目、入职日期、状态（支持中英文）</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" />
                下载 CSV 模板
              </Button>
            </div>
            {importResult && (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-2 max-h-[240px] overflow-auto">
                <div className="text-sm">
                  共 <b>{importResult.total}</b> 行，
                  新增 <b className="text-green-600">{importResult.success}</b>，
                  更新 <b className="text-blue-600">{importResult.updated}</b>，
                  跳过 <b className="text-amber-600">{importResult.skipped}</b>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-xs text-red-500 space-y-0.5">
                    {importResult.errors.slice(0, 10).map((e, i) => (
                      <div key={i}>第 {e.row} 行：{e.reason}</div>
                    ))}
                    {importResult.errors.length > 10 && <div>...还有 {importResult.errors.length - 10} 条错误</div>}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>关闭</Button>
            <Button onClick={doImport} disabled={importing}>
              {importing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              开始导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
