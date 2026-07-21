/**
 * 前端 PDF 文本提取工具
 * 使用 pdfjs-dist 在浏览器端解析 PDF，提取纯文本
 * 避免大文件后端解析超时问题
 */

import * as pdfjsLib from "pdfjs-dist";

// 配置 worker（使用 CDN）
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface PDFParseResult {
  text: string;
  pageCount: number;
  wordCount: number;
  charCount: number;
}

export interface PDFParseProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
}

type ProgressCallback = (progress: PDFParseProgress) => void;

/**
 * 从 PDF 文件提取纯文本
 * @param fileUrl PDF 文件的 URL（需要可访问）
 * @param onProgress 进度回调函数
 * @param signal AbortSignal 用于取消操作
 */
export async function parsePDFText(
  fileUrl: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<PDFParseResult> {
  // 加载 PDF 文档
  const loadingTask = pdfjsLib.getDocument({
    url: fileUrl,
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });

  // 支持取消
  if (signal) {
    signal.addEventListener("abort", () => {
      loadingTask.destroy();
    });
  }

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const textParts: string[] = [];

  // 逐页提取文本
  for (let i = 1; i <= totalPages; i++) {
    // 检查是否被取消
    if (signal?.aborted) {
      throw new Error("解析已取消");
    }

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // 提取文本项
    const pageText = textContent.items
      .map((item: unknown) => {
        const textItem = item as { str?: string };
        return textItem.str || "";
      })
      .join(" ");

    textParts.push(pageText);

    // 报告进度
    if (onProgress) {
      onProgress({
        currentPage: i,
        totalPages,
        percent: Math.round((i / totalPages) * 100),
      });
    }
  }

  const fullText = textParts.join("\n\n").trim();

  return {
    text: fullText,
    pageCount: totalPages,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    charCount: fullText.length,
  };
}

/**
 * 从 File 对象解析 PDF（用于本地文件，无需 URL）
 */
export async function parsePDFFromFile(
  file: File,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<PDFParseResult> {
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/",
    cMapPacked: true,
  });

  if (signal) {
    signal.addEventListener("abort", () => {
      loadingTask.destroy();
    });
  }

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const textParts: string[] = [];

  for (let i = 1; i <= totalPages; i++) {
    if (signal?.aborted) {
      throw new Error("解析已取消");
    }

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: unknown) => {
        const textItem = item as { str?: string };
        return textItem.str || "";
      })
      .join(" ");

    textParts.push(pageText);

    if (onProgress) {
      onProgress({
        currentPage: i,
        totalPages,
        percent: Math.round((i / totalPages) * 100),
      });
    }
  }

  const fullText = textParts.join("\n\n").trim();

  return {
    text: fullText,
    pageCount: totalPages,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    charCount: fullText.length,
  };
}
