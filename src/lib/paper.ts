import { PaperConfig, PaperSnapshot, PaperSnapshotItem, Question } from "./types";
import { pickRandom, shuffle } from "./db";

/** 根据题库题目 + 试卷配置，生成一份试卷快照（题目随机 + 选项随机） */
export function buildPaperSnapshot(
  allQuestions: Question[],
  config: PaperConfig,
): PaperSnapshot {
  const byType = {
    single: allQuestions.filter((q) => q.type === "single"),
    multiple: allQuestions.filter((q) => q.type === "multiple"),
    judge: allQuestions.filter((q) => q.type === "judge"),
  };

  const picked: Question[] = [
    ...pickRandom(byType.single, config.single),
    ...pickRandom(byType.multiple, config.multiple),
    ...pickRandom(byType.judge, config.judge),
  ];

  const items: PaperSnapshotItem[] = picked.map((q) => {
    if (q.type === "judge") {
      // 判断题不需要打乱选项顺序
      return {
        question_id: q.id,
        type: q.type,
        content: q.content,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation ?? null,
      };
    }
    const shuffled = shuffle(q.options);
    // 重新按 A/B/C/D 分配 key
    const keyMap = new Map<string, string>();
    const newLabels = ["A", "B", "C", "D", "E", "F"];
    const newOptions = shuffled.map((opt, idx) => {
      const newKey = newLabels[idx];
      keyMap.set(opt.key, newKey);
      return { key: newKey, text: opt.text };
    });
    const newAnswer = q.answer.map((a) => keyMap.get(a)).filter((v): v is string => !!v);
    return {
      question_id: q.id,
      type: q.type,
      content: q.content,
      options: newOptions,
      answer: newAnswer,
      explanation: q.explanation ?? null,
    };
  });

  const totalCount = items.length || 1;
  const perScore = Math.floor(100 / totalCount);
  // 简单起见每题等分，余数加到最后一题
  return {
    items: shuffle(items),
    score_per: {
      single: perScore,
      multiple: perScore,
      judge: perScore,
    },
  };
}

/** 计算得分：完全匹配才计分，多选错选/漏选均不得分 */
export function scorePaper(
  snapshot: PaperSnapshot,
  answers: Record<string, string[]>,
): { score: number; details: Array<{ qid: string; correct: boolean; user: string[]; right: string[] }> } {
  const totalCount = snapshot.items.length || 1;
  const perScore = Math.floor(100 / totalCount);
  const remainder = 100 - perScore * totalCount;

  let total = 0;
  const details = snapshot.items.map((item, idx) => {
    const user = (answers?.[item.question_id] ?? []).slice().sort();
    const right = item.answer.slice().sort();
    const correct = user.length === right.length && user.every((v, i) => v === right[i]);
    if (correct) {
      total += perScore;
      if (idx === totalCount - 1) total += remainder;
    }
    return { qid: item.question_id, correct, user, right };
  });

  return { score: total, details };
}
