import { type NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE, verifySession } from "@/lib/auth-cookie"

// Rotas de API abertas: o webhook (protegido pela assinatura da Meta) e o login.
const PUBLIC_API = ["/api/instagram/webhook", "/api/instagram/callback"]

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (!pathname.startsWith("/api/")) return NextResponse.next()
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next()

  const userId = await verifySession(request.cookies.get(AUTH_COOKIE)?.value)
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  // Se a rota recebe userId na URL, ele tem de ser o da sessão.
  const qsUser = searchParams.get("userId")
  if (qsUser && qsUser !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  // O mesmo vale para o userId enviado no corpo JSON.
  if (request.method !== "GET" && (request.headers.get("content-type") || "").includes("application/json")) {
    try {
      const body = await request.clone().json()
      const bodyUser = body && typeof body === "object" ? (body as any).userId : undefined
      if (bodyUser != null && String(bodyUser) !== userId) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }
    } catch {
      // corpo vazio ou inválido: a própria rota responde
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
