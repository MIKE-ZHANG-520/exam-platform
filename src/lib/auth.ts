import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto"
import { loadEnv } from "@/storage/database/supabase-client"

export type UserRole = "admin" | "trainer" | "user"

export interface SessionUser {
	id: string
	username: string
	role: UserRole
	real_name: string
	department: string | null
}

const SESSION_COOKIE = "session"
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7 天

// 惰性计算密钥：优先环境变量，否则使用确定性回退值
let _key: Uint8Array | null = null
function getKey(): Uint8Array {
  if (_key) return _key
  // 尝试加载环境变量（COZE_SUPABASE_URL 由沙箱平台注入，需通过 loadEnv 获取）
  try { loadEnv() } catch { /* ignore */ }
  const source = process.env.SESSION_SECRET ||
    process.env.COZE_SUPABASE_URL ||
    "smart-training-platform-2026"
  const secret = createHash("sha256").update(`session-secret::${source}`).digest("hex")
  _key = new TextEncoder().encode(secret)
  return _key
}

export async function signSession(user: SessionUser, remember: boolean): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + (remember ? SESSION_TTL_SEC : 60 * 60 * 24)
	const token = await new SignJWT({
		uid: user.id,
		username: user.username,
		role: user.role,
		real_name: user.real_name,
		department: user.department,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(exp)
		.setIssuedAt()
		.sign(getKey())
	return token
}

export async function verifySession(token: string): Promise<SessionUser | null> {
	try {
		const { payload } = await jwtVerify(token, getKey())
		return {
			id: String(payload.uid),
			username: String(payload.username),
			role: (payload.role as UserRole) || "user",
			real_name: String(payload.real_name || ""),
			department: (payload.department as string) || null,
		}
	} catch {
		return null
	}
}

export async function setSessionCookie(token: string, remember: boolean) {
	const store = await cookies()
	store.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: false,
		path: "/",
		maxAge: remember ? SESSION_TTL_SEC : undefined,
	})
}

export async function clearSessionCookie() {
	const store = await cookies()
	store.delete(SESSION_COOKIE)
}

export async function getSession(): Promise<SessionUser | null> {
	const store = await cookies()
	const raw = store.get(SESSION_COOKIE)?.value
	if (!raw) return null
	return verifySession(raw)
}

export async function requireSession(): Promise<SessionUser> {
	const s = await getSession()
	if (!s) throw new AuthError("UNAUTHORIZED", 401)
	return s
}

export async function requireAdmin(): Promise<SessionUser> {
	const s = await requireSession()
	if (s.role !== "admin") throw new AuthError("FORBIDDEN", 403)
	return s
}

// 检查是否是 trainer 或 admin（培训业务权限）
export function isTrainerOrAbove(role: UserRole): boolean {
	return role === "admin" || role === "trainer"
}

// 检查是否是 admin（系统管理权限）
export function isAdmin(role: UserRole): boolean {
	return role === "admin"
}

export class AuthError extends Error {
	statusCode: number
	constructor(message: string, statusCode: number = 401) {
		super(message)
		this.statusCode = statusCode
	}
}

export function authErrorResponse(err: unknown): NextResponse | null {
	if (err instanceof AuthError) {
		return NextResponse.json({ error: err.message }, { status: err.statusCode })
	}
	return null
}

// 密码哈希：scrypt(password, salt) → salt$hash
export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex")
	const hash = scryptSync(password, salt, 64).toString("hex")
	return `${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split("$")
	if (!salt || !hash) return false
	const test = scryptSync(password, salt, 64)
	const orig = Buffer.from(hash, "hex")
	if (test.length !== orig.length) return false
	return timingSafeEqual(test, orig)
}

// 用于 API 路由：从 request 里读 session，供 middleware 无法覆盖的场景
export async function getSessionFromReq(req: NextRequest): Promise<SessionUser | null> {
	const raw = req.cookies.get(SESSION_COOKIE)?.value
	if (!raw) return null
	return verifySession(raw)
}
