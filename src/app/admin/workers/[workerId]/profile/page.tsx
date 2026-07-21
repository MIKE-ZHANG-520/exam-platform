"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Shield,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  QrCode,
  Printer,
  GraduationCap,
  ClipboardCheck,
  AlertTriangle,
  Plus,
  Calendar,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner"
import { apiGet } from "@/lib/http"

interface WorkerInfo {
  id: string;
  name: string;
  gender: string | null;
  birth_year: number | null;
  phone: string | null;
  work_type: string | null;
  id_card_encrypted: string | null;
  teams?: { name: string } | null;
}

interface WorkerProfile {
  id: string;
  worker_id: string;
  status: string;
  admission_status: string;
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  special_cert_type: string | null;
  special_cert_no: string | null;
  special_cert_issue_date: string | null;
  special_cert_expire_date: string | null;
  special_cert_url: string | null;
  health_report_url: string | null;
  health_check_date: string | null;
  reject_reason: string | null;
  qr_code_url: string | null;
  qr_code_generated: boolean;
  urls?: Record<string, string | null>;
}

interface Training {
  id: string;
  level: string;
  training_date: string;
  instructor: string;
  duration_hours: number;
  content: string | null;
  certificate_url: string | null;
  exam_passed: boolean;
  exam_score: number | null;
}

interface Briefing {
  id: string;
  briefing_date: string;
  instructor: string;
  content: string;
  location: string | null;
  signature_url: string | null;
  witness: string | null;
}

const levelLabels: Record<string, string> = {
  company: "公司级",
  project: "项目级",
  team: "班组级",
};

export default function WorkerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const workerId = params.workerId as string;

  const [worker, setWorker] = useState<WorkerInfo | null>(null);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);

  // 权限检查：仅 admin 可访问
  useEffect(() => {
    apiGet<{ user: { role: string } | null }>("/api/auth/me")
      .then((res) => {
        if (!res.user || res.user.role !== "admin") {
          toast.error("无权限访问工人档案");
          router.push("/admin/dashboard");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        router.push("/admin/dashboard");
      });
  }, [router]);

  // Dialog states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [briefingDialogOpen, setBriefingDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Upload form
  const [uploadType, setUploadType] = useState<string>("id_card_front");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Training form
  const [trainingLevel, setTrainingLevel] = useState("company");
  const [trainingDate, setTrainingDate] = useState("");
  const [trainingInstructor, setTrainingInstructor] = useState("");
  const [trainingDuration, setTrainingDuration] = useState("2");
  const [trainingContent, setTrainingContent] = useState("");
  const [trainingCert, setTrainingCert] = useState<File | null>(null);
  const [trainingPassed, setTrainingPassed] = useState(false);
  const [trainingScore, setTrainingScore] = useState("");

  // Briefing form
  const [briefingDate, setBriefingDate] = useState("");
  const [briefingInstructor, setBriefingInstructor] = useState("");
  const [briefingContent, setBriefingContent] = useState("");
  const [briefingLocation, setBriefingLocation] = useState("");
  const [briefingWitness, setBriefingWitness] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch worker info
      const workerResp = await fetch(`/api/workers?search=&worker_id=${workerId}`);
      const workerData = await workerResp.json();
      if (workerData.items?.length > 0) {
        setWorker(workerData.items[0]);
      }

      // Fetch profile
      const profileResp = await fetch(`/api/worker-profiles?worker_id=${workerId}`);
      const profileData = await profileResp.json();
      setProfile(profileData.profile);

      // Fetch trainings
      const trainingsResp = await fetch(`/api/worker-profiles/${workerId}/trainings`);
      const trainingsData = await trainingsResp.json();
      setTrainings(trainingsData.items || []);

      // Fetch briefings
      const briefingsResp = await fetch(`/api/worker-profiles/${workerId}/briefings`);
      const briefingsData = await briefingsResp.json();
      setBriefings(briefingsData.items || []);
    } catch (err) {
      toast.error("加载失败: " + String(err));
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("worker_id", workerId);
    formData.append(uploadType, uploadFile);

    // 如果是特种作业证，同时提交其他信息
    if (uploadType === "special_cert") {
      const certType = (document.getElementById("cert-type") as HTMLSelectElement)?.value;
      const certNo = (document.getElementById("cert-no") as HTMLInputElement)?.value;
      const certIssueDate = (document.getElementById("cert-issue-date") as HTMLInputElement)?.value;
      const certExpireDate = (document.getElementById("cert-expire-date") as HTMLInputElement)?.value;
      if (certType) formData.append("special_cert_type", certType);
      if (certNo) formData.append("special_cert_no", certNo);
      if (certIssueDate) formData.append("special_cert_issue_date", certIssueDate);
      if (certExpireDate) formData.append("special_cert_expire_date", certExpireDate);
    }

    try {
      const resp = await fetch("/api/worker-profiles", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.profile) {
        toast.success("上传成功");
        setUploadDialogOpen(false);
        setUploadFile(null);
        fetchData();
      } else {
        toast.error("上传失败: " + data.error);
      }
    } catch (err) {
      toast.error("上传失败: " + String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleReview = async (action: "approve" | "reject") => {
    if (action === "reject" && !rejectReason) {
      toast.error("请填写驳回原因");
      return;
    }

    try {
      const resp = await fetch(`/api/worker-profiles/${workerId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reject_reason: rejectReason }),
      });
      const data = await resp.json();
      if (data.profile) {
        toast.success(action === "approve" ? "审核通过" : "已驳回");
        setRejectDialogOpen(false);
        setRejectReason("");
        fetchData();
      } else {
        toast.error("操作失败: " + data.error);
      }
    } catch (err) {
      toast.error("操作失败: " + String(err));
    }
  };

  const handleGenerateQR = async () => {
    try {
      const resp = await fetch(`/api/worker-profiles/${workerId}/review`, {
        method: "PUT",
      });
      const data = await resp.json();
      if (data.qr_code) {
        toast.success("二维码生成成功");
        fetchData();
      } else {
        toast.error("生成失败: " + data.error);
      }
    } catch (err) {
      toast.error("生成失败: " + String(err));
    }
  };

  const handleAddTraining = async () => {
    if (!trainingDate || !trainingInstructor) {
      toast.error("请填写必填字段");
      return;
    }

    const formData = new FormData();
    formData.append("level", trainingLevel);
    formData.append("training_date", trainingDate);
    formData.append("instructor", trainingInstructor);
    formData.append("duration_hours", trainingDuration);
    formData.append("content", trainingContent);
    formData.append("exam_passed", trainingPassed.toString());
    if (trainingScore) formData.append("exam_score", trainingScore);
    if (trainingCert) formData.append("certificate", trainingCert);

    try {
      const resp = await fetch(`/api/worker-profiles/${workerId}/trainings`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.training) {
        toast.success("培训记录添加成功");
        setTrainingDialogOpen(false);
        resetTrainingForm();
        fetchData();
      } else {
        toast.error("添加失败: " + data.error);
      }
    } catch (err) {
      toast.error("添加失败: " + String(err));
    }
  };

  const handleAddBriefing = async () => {
    if (!briefingDate || !briefingInstructor || !briefingContent) {
      toast.error("请填写必填字段");
      return;
    }

    const formData = new FormData();
    formData.append("briefing_date", briefingDate);
    formData.append("instructor", briefingInstructor);
    formData.append("content", briefingContent);
    formData.append("location", briefingLocation);
    formData.append("witness", briefingWitness);

    try {
      const resp = await fetch(`/api/worker-profiles/${workerId}/briefings`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.briefing) {
        toast.success("交底记录添加成功");
        setBriefingDialogOpen(false);
        resetBriefingForm();
        fetchData();
      } else {
        toast.error("添加失败: " + data.error);
      }
    } catch (err) {
      toast.error("添加失败: " + String(err));
    }
  };

  const resetTrainingForm = () => {
    setTrainingLevel("company");
    setTrainingDate("");
    setTrainingInstructor("");
    setTrainingDuration("2");
    setTrainingContent("");
    setTrainingCert(null);
    setTrainingPassed(false);
    setTrainingScore("");
  };

  const resetBriefingForm = () => {
    setBriefingDate("");
    setBriefingInstructor("");
    setBriefingContent("");
    setBriefingLocation("");
    setBriefingWitness("");
  };

  const printQRCode = () => {
    if (!profile?.qr_code_url) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>工人入场证 - ${worker?.name}</title>
          <style>
            body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
            .card { border: 2px solid #1677ff; border-radius: 12px; padding: 24px; text-align: center; width: 300px; }
            .name { font-size: 20px; font-weight: bold; margin-bottom: 8px; }
            .info { font-size: 12px; color: #666; margin-bottom: 16px; }
            img { width: 200px; height: 200px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="name">${worker?.name || ""}</div>
            <div class="info">${worker?.work_type || ""} | ${worker?.teams?.name || ""}</div>
            <img src="${profile.qr_code_url}" alt="QR Code" />
            <div class="info">扫码查看培训档案</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (checking || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">工人信息不存在</p>
        <Button className="mt-4" onClick={() => router.push("/admin/workers")}>
          返回列表
        </Button>
      </div>
    );
  }

  const completedLevels = new Set(trainings.map((t) => t.level));
  const hasAllTrainings = completedLevels.has("company") && completedLevels.has("project") && completedLevels.has("team");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/workers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/20 text-lg font-semibold text-primary">
            {worker.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{worker.name}</h1>
            <p className="text-sm text-muted-foreground">
              {worker.work_type || "未设置工种"} | {worker.teams?.name || "未分配班组"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.status === "pending" && (
              <>
                <Button onClick={() => handleReview("approve")} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  通过
                </Button>
                <Button variant="destructive" onClick={() => setRejectDialogOpen(true)} className="gap-2">
                  <XCircle className="h-4 w-4" />
                  驳回
                </Button>
              </>
            )}
            {profile?.status === "approved" && !profile.qr_code_generated && (
              <Button onClick={handleGenerateQR} className="gap-2">
                <QrCode className="h-4 w-4" />
                生成二维码
              </Button>
            )}
            {profile?.qr_code_generated && (
              <Button variant="outline" onClick={printQRCode} className="gap-2">
                <Printer className="h-4 w-4" />
                打印入场证
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Status Overview */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          <StatusCard
            title="资料审核"
            status={profile?.status || "not_created"}
            statusLabels={{
              not_created: "未建档",
              pending: "待审核",
              approved: "已通过",
              rejected: "已驳回",
            }}
          />
          <StatusCard
            title="三级教育"
            status={hasAllTrainings ? "completed" : "in_progress"}
            statusLabels={{ completed: "已完成", in_progress: `${completedLevels.size}/3 级` }}
          />
          <StatusCard
            title="入场交底"
            status={briefings.length > 0 ? "completed" : "pending"}
            statusLabels={{ completed: "已完成", pending: "未完成" }}
          />
          <StatusCard
            title="入场状态"
            status={profile?.admission_status || "not_started"}
            statusLabels={{
              not_started: "未开始",
              training: "培训中",
              briefing: "待交底",
              admitted: "已入场",
            }}
          />
        </div>

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="documents">入场资料</TabsTrigger>
            <TabsTrigger value="training">三级教育</TabsTrigger>
            <TabsTrigger value="briefing">入场交底</TabsTrigger>
            <TabsTrigger value="qrcode">二维码</TabsTrigger>
          </TabsList>

          {/* 入场资料 Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    入场资料
                  </CardTitle>
                  <Button size="sm" onClick={() => setUploadDialogOpen(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    上传资料
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 身份证 */}
                <div className="space-y-3">
                  <h3 className="font-medium">身份证件</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <ImageCard
                      title="身份证正面"
                      url={profile?.urls?.id_card_front_url}
                      onUpload={() => { setUploadType("id_card_front"); setUploadDialogOpen(true); }}
                    />
                    <ImageCard
                      title="身份证反面"
                      url={profile?.urls?.id_card_back_url}
                      onUpload={() => { setUploadType("id_card_back"); setUploadDialogOpen(true); }}
                    />
                  </div>
                </div>

                {/* 特种作业证 */}
                <div className="space-y-3">
                  <h3 className="font-medium">特种作业证件</h3>
                  {profile?.special_cert_type ? (
                    <div className="rounded-lg border p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">证件类型：</span>
                          {profile.special_cert_type}
                        </div>
                        <div>
                          <span className="text-muted-foreground">证件编号：</span>
                          {profile.special_cert_no || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">发证日期：</span>
                          {profile.special_cert_issue_date || "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">有效期至：</span>
                          <span className={cn(
                            profile.special_cert_expire_date &&
                            new Date(profile.special_cert_expire_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                            "text-red-600 font-medium"
                          )}>
                            {profile.special_cert_expire_date || "-"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4">
                        <ImageCard
                          title="证件照片"
                          url={profile?.urls?.special_cert_url}
                          onUpload={() => { setUploadType("special_cert"); setUploadDialogOpen(true); }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => { setUploadType("special_cert"); setUploadDialogOpen(true); }} className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      上传特种作业证
                    </Button>
                  )}
                </div>

                {/* 体检报告 */}
                <div className="space-y-3">
                  <h3 className="font-medium">体检报告</h3>
                  <ImageCard
                    title="体检报告"
                    url={profile?.urls?.health_report_url}
                    onUpload={() => { setUploadType("health_report"); setUploadDialogOpen(true); }}
                  />
                </div>

                {/* 驳回原因 */}
                {profile?.status === "rejected" && profile.reject_reason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">驳回原因</span>
                    </div>
                    <p className="mt-2 text-sm text-red-600">{profile.reject_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 三级教育 Tab */}
          <TabsContent value="training">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    三级安全教育培训
                  </CardTitle>
                  <Button size="sm" onClick={() => setTrainingDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    添加记录
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {trainings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <GraduationCap className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm text-muted-foreground">暂无培训记录</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(["company", "project", "team"] as const).map((level) => {
                      const training = trainings.find((t) => t.level === level);
                      return (
                        <div
                          key={level}
                          className={cn(
                            "rounded-lg border p-4",
                            training ? "border-green-200 bg-green-50/50" : "border-dashed"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full",
                                training ? "bg-green-100" : "bg-muted"
                              )}>
                                {training ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <span className="font-medium">{levelLabels[level]}</span>
                            </div>
                            {training && (
                              <Badge variant="outline" className="text-xs">
                                {training.training_date}
                              </Badge>
                            )}
                          </div>
                          {training && (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">讲师：</span>
                                {training.instructor}
                              </div>
                              <div>
                                <span className="text-muted-foreground">时长：</span>
                                {training.duration_hours} 小时
                              </div>
                              {training.exam_score !== null && (
                                <div>
                                  <span className="text-muted-foreground">考试成绩：</span>
                                  <span className={training.exam_passed ? "text-green-600" : "text-red-600"}>
                                    {training.exam_score} 分 ({training.exam_passed ? "通过" : "未通过"})
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 入场交底 Tab */}
          <TabsContent value="briefing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                    入场交底记录
                  </CardTitle>
                  <Button size="sm" onClick={() => setBriefingDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    添加记录
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {briefings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardCheck className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm text-muted-foreground">暂无交底记录</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {briefings.map((briefing) => (
                      <div key={briefing.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="font-medium">{briefing.briefing_date}</span>
                          </div>
                          {briefing.location && (
                            <Badge variant="outline">{briefing.location}</Badge>
                          )}
                        </div>
                        <div className="mt-3 text-sm">
                          <div className="mb-2">
                            <span className="text-muted-foreground">交底人：</span>
                            {briefing.instructor}
                            {briefing.witness && (
                              <span className="ml-4 text-muted-foreground">见证人：{briefing.witness}</span>
                            )}
                          </div>
                          <div className="rounded bg-muted/50 p-3 text-muted-foreground">
                            {briefing.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 二维码 Tab */}
          <TabsContent value="qrcode">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  入场二维码
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profile?.qr_code_generated && profile.qr_code_url ? (
                  <div className="flex flex-col items-center">
                    <div className="rounded-xl border-4 border-primary/20 bg-white p-6">
                      <img src={profile.qr_code_url} alt="QR Code" className="h-64 w-64" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      扫描二维码可查看工人培训档案
                    </p>
                    <Button className="mt-4 gap-2" onClick={printQRCode}>
                      <Printer className="h-4 w-4" />
                      打印入场证
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4">
                      <QrCode className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      {profile?.status === "approved"
                        ? "点击顶部【生成二维码】按钮创建入场二维码"
                        : "需先完成资料审核通过后才能生成二维码"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传资料</DialogTitle>
            <DialogDescription>
              {uploadType === "id_card_front" && "上传身份证正面照片"}
              {uploadType === "id_card_back" && "上传身份证反面照片"}
              {uploadType === "special_cert" && "上传特种作业证件"}
              {uploadType === "health_report" && "上传体检报告"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {uploadType === "special_cert" && (
              <>
                <div className="space-y-2">
                  <Label>证件类型</Label>
                  <Select defaultValue="电工">
                    <SelectTrigger id="cert-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="电工">电工</SelectItem>
                      <SelectItem value="焊工">焊工</SelectItem>
                      <SelectItem value="架子工">架子工</SelectItem>
                      <SelectItem value="塔吊司机">塔吊司机</SelectItem>
                      <SelectItem value="信号工">信号工</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>证件编号</Label>
                    <Input id="cert-no" placeholder="请输入证件编号" />
                  </div>
                  <div className="space-y-2">
                    <Label>发证日期</Label>
                    <Input id="cert-issue-date" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>有效期至</Label>
                  <Input id="cert-expire-date" type="date" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>选择文件</Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? "上传中..." : "上传"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Training Dialog */}
      <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加三级教育培训记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>培训级别 *</Label>
              <Select value={trainingLevel} onValueChange={setTrainingLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">公司级</SelectItem>
                  <SelectItem value="project">项目级</SelectItem>
                  <SelectItem value="team">班组级</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>培训日期 *</Label>
                <Input type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>培训时长(小时)</Label>
                <Input type="number" value={trainingDuration} onChange={(e) => setTrainingDuration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>培训讲师 *</Label>
              <Input value={trainingInstructor} onChange={(e) => setTrainingInstructor(e.target.value)} placeholder="请输入讲师姓名" />
            </div>
            <div className="space-y-2">
              <Label>培训内容</Label>
              <Textarea value={trainingContent} onChange={(e) => setTrainingContent(e.target.value)} placeholder="请输入培训内容" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>考试分数</Label>
                <Input type="number" value={trainingScore} onChange={(e) => setTrainingScore(e.target.value)} placeholder="0-100" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={trainingPassed}
                    onChange={(e) => setTrainingPassed(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">通过考试</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>培训证书照片</Label>
              <Input type="file" accept="image/*" onChange={(e) => setTrainingCert(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrainingDialogOpen(false)}>取消</Button>
            <Button onClick={handleAddTraining}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Briefing Dialog */}
      <Dialog open={briefingDialogOpen} onOpenChange={setBriefingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加入场交底记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>交底日期 *</Label>
                <Input type="date" value={briefingDate} onChange={(e) => setBriefingDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>交底地点</Label>
                <Input value={briefingLocation} onChange={(e) => setBriefingLocation(e.target.value)} placeholder="请输入地点" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>交底人 *</Label>
              <Input value={briefingInstructor} onChange={(e) => setBriefingInstructor(e.target.value)} placeholder="请输入交底人姓名" />
            </div>
            <div className="space-y-2">
              <Label>见证人</Label>
              <Input value={briefingWitness} onChange={(e) => setBriefingWitness(e.target.value)} placeholder="请输入见证人姓名" />
            </div>
            <div className="space-y-2">
              <Label>交底内容 *</Label>
              <Textarea
                value={briefingContent}
                onChange={(e) => setBriefingContent(e.target.value)}
                placeholder="请输入交底内容"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBriefingDialogOpen(false)}>取消</Button>
            <Button onClick={handleAddBriefing}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回申请</DialogTitle>
            <DialogDescription>请填写驳回原因，工人需要补充资料后重新提交</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>驳回原因</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请说明驳回原因..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => handleReview("reject")}>确认驳回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusCard({
  title,
  status,
  statusLabels,
}: {
  title: string;
  status: string;
  statusLabels: Record<string, string>;
}) {
  const label = statusLabels[status] || status;
  const isCompleted = status === "approved" || status === "completed" || status === "admitted";
  const isPending = status === "pending" || status === "in_progress" || status === "training" || status === "briefing";
  const isError = status === "rejected" || status === "not_created";

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className={cn(
            "h-2 w-2 rounded-full",
            isCompleted && "bg-green-500",
            isPending && "bg-amber-500",
            isError && "bg-red-500"
          )} />
          <span className={cn(
            "font-medium",
            isCompleted && "text-green-600",
            isPending && "text-amber-600",
            isError && "text-red-600"
          )}>
            {label}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageCard({
  title,
  url,
  onUpload,
}: {
  title: string;
  url: string | null | undefined;
  onUpload: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
      {url ? (
        <>
          <img src={url} alt={title} className="h-32 w-full object-contain" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Button size="sm" variant="secondary" onClick={onUpload}>
              重新上传
            </Button>
          </div>
        </>
      ) : (
        <button
          onClick={onUpload}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Upload className="h-6 w-6" />
          <span className="text-xs">点击上传</span>
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <span className="text-xs text-white">{title}</span>
      </div>
    </div>
  );
}
