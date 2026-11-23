// Cookie de sessão assinado (HMAC SHA-256). Funciona no Edge (middleware) e no Node.
// Sem ele, qualquer pessoa que soubesse o userId poderia chamar as rotas /api.

export const AUTH_COOKIE = "se_auth"

function getSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.INSTAGRAM_APP_SECRET || ""
  if (!s) throw new Error("SESSION_SECRET/INSTAGRAM_APP_SECRET ausente")
  return s
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return toHex(sig)
}

export async function signSession(userId: string, maxAgeSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds
  const payload = `${userId}.${exp}`
  return `${payload}.${await hmac(payload)}`
}

/** Retorna o userId se o cookie for válido e não estiver vencido; senão null. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const exp = Number(expStr)
  if (!userId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  const expected = await hmac(`${userId}.${expStr}`)
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0 ? userId : null
}
