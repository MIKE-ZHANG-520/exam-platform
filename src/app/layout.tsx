import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '智慧培训考试平台',
    template: '%s | 智慧培训考试平台',
  },
  description: '企业级培训 + 考试一体化平台：材料智能解析、AI 生成提纲与题库、扫码答题、数据看板。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {isDev && <Inspector />}
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
