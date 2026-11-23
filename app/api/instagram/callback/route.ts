import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { AUTH_COOKIE, signSession } from "@/lib/auth-cookie"

// Login pelo Facebook (Instagram API with Facebook Login), exigido em apps Meta novos.
// Fluxo: code -> token de usuário -> token longo -> Página com Instagram vinculado -> token da Página.
// O token da Página derivado de um token longo não expira.

const FB = "https://graph.facebook.com/v24.0"
const SESSION_SECONDS = 60 * 24 * 60 * 60 // 60 dias

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error) {
    const redirectUrl = new URL("/", request.url)
    redirectUrl.searchParams.set("error", error)
    return NextResponse.redirect(redirectUrl)
  }

  if (code) {
    const redirectUrl = new URL("/", request.url)
    redirectUrl.searchParams.set("code", code)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.json({ error: "Invalid callback" }, { status: 400 })
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" })
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`)
  }
  return json
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body
    if (!code) return NextResponse.json({ error: "No code" }, { status: 400 })

    const clientId = process.env.INSTAGRAM_APP_ID
    const clientSecret = process.env.INSTAGRAM_APP_SECRET
    const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing Env Vars: Check INSTAGRAM_APP_ID")
    }

    // 1. code -> token de usuário (curto)
    let shortToken: string
    try {
      const t = await getJson(
        `${FB}/oauth/access_token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
      )
      shortToken = t.access_token
    } catch (e: any) {
      if (String(e.message).toLowerCase().includes("been used")) {
        return NextResponse.json({ error: "Code already used" }, { status: 400 })
      }
      throw e
    }

    // 2. token longo (60 dias); se falhar, segue com o curto
    let userToken = shortToken
    try {
      const l = await getJson(
        `${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
      )
      if (l.access_token) userToken = l.access_token
    } catch (e) {
      console.warn("[callback] long-lived exchange failed:", (e as Error).message)
    }

    // 3. Páginas com Instagram profissional vinculado
    const pages = await getJson(
      `${FB}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&limit=100&access_token=${encodeURIComponent(userToken)}`,
    )
    const withIg = (pages.data || []).filter((p: any) => p.instagram_business_account?.id && p.access_token)
    if (!withIg.length) {
      return NextResponse.json(
        { error: "Nenhuma Página do Facebook com conta profissional do Instagram vinculada foi autorizada no login." },
        { status: 400 },
      )
    }
    const preferred = (process.env.INSTAGRAM_USERNAME || "").toLowerCase()
    const page =
      withIg.find((p: any) => preferred && p.instagram_business_account.username?.toLowerCase() === preferred) || withIg[0]

    const ig = page.instagram_business_account
    const igId = String(ig.id)
    const username: string = ig.username || `user_${igId}`
    const profilePic: string | null = ig.profile_picture_url || null
    const pageToken: string = page.access_token
    const pageId = String(page.id)

    // 4. Assina a Página no app para receber os webhooks de mensagens
    try {
      const subRes = await fetch(
        `${FB}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(pageToken)}`,
        { method: "POST", signal: AbortSignal.timeout(15000) },
      )
      const sub = await subRes.json()
      if (sub.error) console.warn("[callback] subscribed_apps:", JSON.stringify(sub.error))
    } catch (e) {
      console.warn("[callback] subscribed_apps failed:", (e as Error).message)
    }

    // 5. Salva o usuário (id = ID da conta profissional, igual ao entry.id dos webhooks)
    const supabase = await getSupabaseServerClient()
    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id: igId,
        username,
        access_token: pageToken,
        token_expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        business_account_id: igId,
        page_id: pageId,
      },
      { onConflict: "id" },
    )
    if (upsertError) throw upsertError

    const response = NextResponse.json({ success: true, username, userId: igId, profilePic })
    response.cookies.set("insta_session", JSON.stringify({ username, userId: igId }), {
      path: "/",
      maxAge: SESSION_SECONDS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    response.cookies.set(AUTH_COOKIE, await signSession(igId, SESSION_SECONDS), {
      path: "/",
      maxAge: SESSION_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    })
    return response
  } catch (error: any) {
    console.error("[callback] error:", error?.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
