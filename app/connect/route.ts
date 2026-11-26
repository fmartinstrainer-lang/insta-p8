import { NextResponse } from "next/server"

// Abre o login do Facebook com os dados do app lidos no servidor (nada fica fixo no navegador).
export async function GET() {
  const appId = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || ""
  const redirect = encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI || process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI || "")
  const configId = process.env.FB_LOGIN_CONFIG_ID || process.env.NEXT_PUBLIC_FB_LOGIN_CONFIG_ID
  const auth = configId
    ? `config_id=${configId}&override_default_response_type=true`
    : `scope=${encodeURIComponent("instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,business_management")}`
  if (!appId || !redirect) return new NextResponse("App da Meta não configurado", { status: 500 })
  return NextResponse.redirect(`https://www.facebook.com/v24.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&response_type=code&${auth}`)
}
