import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySession } from "@/lib/auth"
import { AppShell } from "@/components/admin/app-shell"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const cookieStore = await cookies()
	const token = cookieStore.get("session")?.value
	const user = token ? await verifySession(token) : null

	if (!user) {
		redirect("/login")
	}

	return (
		<AppShell user={user}>
			{children}
		</AppShell>
	)
}
