"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Filter,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  QrCode,
  Eye,
  ChevronRight,
  Shield,
  AlertTriangle,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { toast } from "sonner"

interface WorkerWithProfile {
  id: string;
  name: string;
  gender: string | null;
  birth_year: number | null;
  phone: string | null;
  work_type: string | null;
  team_id: string | null;
  teams?: { name: string } | null;
  profile?: {
    id: string;
    status: string;
    admission_status: string;
    qr_code_generated: boolean;
    special_cert_type: string | null;
    special_cert_expire_date: string | null;
  } | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "待审核", variant: "secondary", icon: Clock },
  approved: { label: "已通过", variant: "default", icon: CheckCircle2 },
  rejected: { label: "已驳回", variant: "destructive", icon: XCircle },
};

const admissionStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "未开始", color: "text-muted-foreground", icon: Clock },
  training: { label: "培训中", color: "text-blue-600", icon: GraduationCap },
  briefing: { label: "待交底", color: "text-amber-600", icon: ClipboardCheck },
  admitted: { label: "已入场", color: "text-green-600", icon: CheckCircle2 },
};

// 预计算30天后的时间戳，避免在渲染中调用 Date.now()
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function WorkerProfilesPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<WorkerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [admissionFilter, setAdmissionFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    admitted: 0,
    certExpiring: 0,
  });

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (admissionFilter !== "all") params.set("admission_status", admissionFilter);

      const resp = await fetch(`/api/workers?${params}`);
      const data = await resp.json();

      if (data.items) {
        setWorkers(data.items);

        // 计算统计
        const pending = data.items.filter((w: WorkerWithProfile) => w.profile?.status === "pending").length;
        const approved = data.items.filter((w: WorkerWithProfile) => w.profile?.status === "approved").length;
        const admitted = data.items.filter((w: WorkerWithProfile) => w.profile?.admission_status === "admitted").length;

        // 检查证件即将过期（30天内）
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const certExpiring = data.items.filter((w: WorkerWithProfile) => {
          if (!w.profile?.special_cert_expire_date) return false;
          const expireDate = new Date(w.profile.special_cert_expire_date);
          return expireDate <= thirtyDaysLater && expireDate > now;
        }).length;

        setStats({
          total: data.items.length,
          pending,
          approved,
          admitted,
          certExpiring,
        });
      }
    } catch (err) {
      toast.error("加载失败: " + String(err));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, admissionFilter]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={<Shield className="h-5 w-5" />}
        title="工人安全管理"
        description="一人一档管理、入场审核、培训记录、二维码"
      />

      <div className="mx-auto max-w-[1440px] px-6 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            title="总人数"
            value={stats.total}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="待审核"
            value={stats.pending}
            icon={Clock}
            color="amber"
          />
          <StatCard
            title="已通过"
            value={stats.approved}
            icon={CheckCircle2}
            color="green"
          />
          <StatCard
            title="已入场"
            value={stats.admitted}
            icon={Shield}
            color="emerald"
          />
          <StatCard
            title="证件即将到期"
            value={stats.certExpiring}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* 筛选栏 */}
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                工人档案
              </CardTitle>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索姓名..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-40 pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="审核状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                    <SelectItem value="approved">已通过</SelectItem>
                    <SelectItem value="rejected">已驳回</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={admissionFilter} onValueChange={setAdmissionFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="入场状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="not_started">未开始</SelectItem>
                    <SelectItem value="training">培训中</SelectItem>
                    <SelectItem value="briefing">待交底</SelectItem>
                    <SelectItem value="admitted">已入场</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : workers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">暂无工人数据</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workers.map((worker) => (
                  <WorkerRow
                    key={worker.id}
                    worker={worker}
                    onClick={() => router.push(`/admin/workers/${worker.id}/profile`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "green" | "amber" | "red" | "emerald";
}) {
  const colorMap = {
    blue: "from-blue-50 to-blue-100 text-blue-600",
    green: "from-green-50 to-green-100 text-green-600",
    amber: "from-amber-50 to-amber-100 text-amber-600",
    red: "from-red-50 to-red-100 text-red-600",
    emerald: "from-emerald-50 to-emerald-100 text-emerald-600",
  };

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-xl bg-gradient-to-br p-3", colorMap[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerRow({
  worker,
  onClick,
}: {
  worker: WorkerWithProfile;
  onClick: () => void;
}) {
  const status = worker.profile?.status || "not_created";
  const admissionStatus = worker.profile?.admission_status || "not_started";
  const statusInfo = statusConfig[status] || { label: "未建档", variant: "outline" as const, icon: FileText };
  const admissionInfo = admissionStatusConfig[admissionStatus] || admissionStatusConfig.not_started;

  // 检查证件是否过期
  const isCertExpiring = worker.profile?.special_cert_expire_date && (() => {
    const expireDate = new Date(worker.profile.special_cert_expire_date);
    const now = new Date().getTime();
    const thirtyDaysLater = new Date(now + 30 * 24 * 60 * 60 * 1000);
    return expireDate <= thirtyDaysLater && expireDate.getTime() > now;
  })();

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 rounded-lg border border-border/50 p-4 transition-all hover:border-primary/30 hover:bg-primary/5"
    >
      {/* 头像 */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/20 text-sm font-semibold text-primary">
        {worker.name.charAt(0)}
      </div>

      {/* 基本信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{worker.name}</span>
          {worker.gender && (
            <span className="text-xs text-muted-foreground">
              {worker.gender === "male" ? "男" : "女"}
            </span>
          )}
          {worker.work_type && (
            <Badge variant="outline" className="text-xs">
              {worker.work_type}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {worker.teams && <span>班组: {worker.teams.name}</span>}
          {worker.profile?.special_cert_type && (
            <span className={cn(isCertExpiring && "text-amber-600")}>
              {worker.profile.special_cert_type}
              {isCertExpiring && " (即将到期)"}
            </span>
          )}
        </div>
      </div>

      {/* 状态标签 */}
      <div className="flex items-center gap-3">
        <Badge variant={statusInfo.variant} className="gap-1">
          <statusInfo.icon className="h-3 w-3" />
          {statusInfo.label}
        </Badge>
        <div className={cn("flex items-center gap-1 text-xs", admissionInfo.color)}>
          <admissionInfo.icon className="h-3.5 w-3.5" />
          {admissionInfo.label}
        </div>
        {worker.profile?.qr_code_generated && (
          <QrCode className="h-4 w-4 text-green-600" />
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
