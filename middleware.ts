import { type NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE, verifySession } from "@/lib/auth-cookie"

// Rotas abertas: o webhook (protegido pela assinatura da Meta), o retorno do login e a política de privacidade.
const PUBLIC_PATHS = ["/api/instagram/webhook", "/api/instagram/callback", "/privacy"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

// Senha do painel (HTTP Basic). Sem ADMIN_PASSWORD configurada, as páginas ficam fechadas.
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function hasPanelPassword(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD || ""
  if (!expected) return false
  const header = request.headers.get("authorization") || ""
  if (!header.startsWith("Basic ")) return false
  try {
    const decoded = atob(header.slice(6))
    const pass = decoded.slice(decoded.indexOf(":") + 1)
    return timingSafeEqual(pass, expected)
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  if (!hasPanelPassword(request)) {
    return new NextResponse("Acesso restrito", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Painel", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" },
    })
  }

  if (!pathname.startsWith("/api/")) {
    const res = NextResponse.next()
    res.headers.set("X-Robots-Tag", "noindex, nofollow")
    return res
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
