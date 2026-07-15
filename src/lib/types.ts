// 常见类型定义

export type QuestionType = "single" | "multiple" | "judge";

export interface QuestionOption {
  key: string; // A/B/C/D
  text: string;
}

export interface Question {
  id: string;
  bank_id: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  answer: string[]; // 正确答案 key 列表
  explanation?: string | null;
  order_no: number;
}

export interface PaperConfig {
  single: number;
  multiple: number;
  judge: number;
}

export interface RequiredFields {
  name: boolean;
  phone: boolean;
  team: boolean;
  id_card: boolean;
}

export interface PaperSnapshotItem {
  question_id: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[]; // 已打乱顺序
  answer: string[];          // 打乱后重新映射的正确答案 keys
  explanation?: string | null;
}

export interface PaperSnapshot {
  items: PaperSnapshotItem[];
  score_per: {
    single: number;
    multiple: number;
    judge: number;
  };
}
