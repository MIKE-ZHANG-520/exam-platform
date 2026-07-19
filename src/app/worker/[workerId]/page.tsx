"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  User,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  GraduationCap,
  ClipboardCheck,
  Award,
  Calendar,
  FileText,
} from "lucide-react";

interface WorkerData {
  worker: {
    name: string;
    gender: string | null;
    age: number | null;
    work_type: string | null;
    team_name: string | null;
  };
  profile: {
    status: string;
    admission_status: string;
    special_cert_type: string | null;
    special_cert_expire_date: string | null;
    cert_status: string;
    cert_url: string | null;
  };
  training_stats: {
    company: number;
    project: number;
    team: number;
    total: number;
  };
  trainings: Array<{
    level: string;
    training_date: string;
    instructor: string;
    duration_hours: number;
    exam_passed: boolean;
  }>;
  briefings: Array<{
    briefing_date: string;
    instructor: string;
    location: string | null;
  }>;
  special_trainings: Array<{
    title: string;
    training_date: string;
    duration_hours: number;
  }>;
}

const levelLabels: Record<string, string> = {
  company: "公司级",
  project: "项目级",
  team: "班组级",
};

const admissionLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "未入场", color: "bg-gray-100 text-gray-600", icon: Clock },
  training: { label: "培训中", color: "bg-blue-100 text-blue-600", icon: GraduationCap },
  briefing: { label: "待交底", color: "bg-amber-100 text-amber-600", icon: ClipboardCheck },
  admitted: { label: "已入场", color: "bg-green-100 text-green-600", icon: CheckCircle2 },
};

export default function WorkerPublicPage() {
  const params = useParams();
  const workerId = params.workerId as string;
  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resp = await fetch(`/api/workers/${workerId}/public`);
        const result = await resp.json();
        if (result.error) {
          setError(result.error);
        } else {
          setData(result);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [workerId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-red-50 to-white p-4">
        <div className="rounded-full bg-red-100 p-4">
          <XCircle className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">无法获取信息</h1>
        <p className="mt-2 text-center text-sm text-gray-500">{error || "工人信息不存在"}</p>
      </div>
    );
  }

  const { worker, profile, training_stats, trainings, briefings } = data;
  const admissionInfo = admissionLabels[profile.admission_status] || admissionLabels.not_started;
  const AdmissionIcon = admissionInfo.icon;

  // 检查三级教育完成情况
  const completedLevels = new Set(trainings.map((t) => t.level));
  const hasAllTrainings = completedLevels.has("company") && completedLevels.has("project") && completedLevels.has("team");

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-4 py-6 text-white">
        <div className="mx-auto max-w-[480px]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
              {worker.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{worker.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/90">
                {worker.work_type && <span>{worker.work_type}</span>}
                {worker.team_name && <span>· {worker.team_name}</span>}
                {worker.age && <span>· {worker.age}岁</span>}
              </div>
            </div>
          </div>

          {/* 入场状态 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
            <AdmissionIcon className="h-5 w-5" />
            <span className="font-medium">入场状态：</span>
            <span className="font-bold">{admissionInfo.label}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[480px] px-4">
        {/* 证件状态 */}
        {profile.special_cert_type && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <span className="font-medium">特种作业证</span>
              {profile.cert_status === "expired" && (
                <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                  已过期
                </span>
              )}
              {profile.cert_status === "expiring" && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">
                  即将到期
                </span>
              )}
              {profile.cert_status === "valid" && (
                <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                  有效
                </span>
              )}
            </div>
            <div className="mt-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>证件类型</span>
                <span className="font-medium text-gray-900">{profile.special_cert_type}</span>
              </div>
              {profile.special_cert_expire_date && (
                <div className="mt-2 flex justify-between">
                  <span>有效期至</span>
                  <span className={profile.cert_status !== "valid" ? "font-medium text-red-600" : "text-gray-900"}>
                    {profile.special_cert_expire_date}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 三级教育统计 */}
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-medium">三级安全教育</span>
            {hasAllTrainings ? (
              <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                已完成
              </span>
            ) : (
              <span className="ml-auto text-sm text-gray-500">
                {training_stats.company + training_stats.project + training_stats.team}/3 级
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {(["company", "project", "team"] as const).map((level) => {
              const count = training_stats[level];
              const isCompleted = completedLevels.has(level);
              return (
                <div
                  key={level}
                  className={`rounded-lg p-3 text-center ${
                    isCompleted ? "bg-green-50" : "bg-gray-50"
                  }`}
                >
                  <div className={`text-2xl font-bold ${isCompleted ? "text-green-600" : "text-gray-400"}`}>
                    {count}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{levelLabels[level]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 培训记录 */}
        {trainings.length > 0 && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium">培训记录</span>
              <span className="ml-auto text-sm text-gray-500">共 {trainings.length} 次</span>
            </div>
            <div className="mt-3 space-y-3">
              {trainings.map((t, i) => (
                <div key={i} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                      {levelLabels[t.level]}
                    </span>
                    <span className="text-xs text-gray-500">{t.training_date}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-600">讲师：{t.instructor}</span>
                    <span className={t.exam_passed ? "text-green-600" : "text-gray-500"}>
                      {t.exam_passed ? "已通过" : `${t.duration_hours}课时`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 交底记录 */}
        {briefings.length > 0 && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <span className="font-medium">入场交底</span>
              <span className="ml-auto text-sm text-gray-500">共 {briefings.length} 次</span>
            </div>
            <div className="mt-3 space-y-3">
              {briefings.map((b, i) => (
                <div key={i} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">交底人：{b.instructor}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {b.briefing_date}
                    </span>
                  </div>
                  {b.location && (
                    <div className="mt-1 text-xs text-gray-500">地点：{b.location}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部提示 */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <Shield className="mx-auto mb-1 h-4 w-4" />
          <p>智慧培训考试平台 · 工人安全档案</p>
        </div>
      </div>
    </div>
  );
}
