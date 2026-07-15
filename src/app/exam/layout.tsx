import type { ReactNode } from "react"

export default function ExamLayout({ children }: { children: ReactNode }) {
	return <div className="min-h-screen bg-[#f5f7fa]">{children}</div>
}
