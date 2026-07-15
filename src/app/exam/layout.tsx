import type { ReactNode } from "react"
import { BrandBadge } from "@/components/brand-badge"

export default function ExamLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-[#f5f7fa] flex flex-col">
			<div className="flex-1">{children}</div>
			<div className="py-4 flex justify-center">
				<BrandBadge />
			</div>
		</div>
	)
}
