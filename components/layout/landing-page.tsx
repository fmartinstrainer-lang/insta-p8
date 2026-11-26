"use client"

// Página interna da Seu Embarque. Sem vitrine pública: o acesso já passa pela senha do painel.
export function LandingPage() {
  const handleLogin = () => {
    window.location.href = "/connect"
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ marginBottom: 16 }}>Painel interno</p>
        <button onClick={handleLogin} style={{ padding: "10px 20px", border: "1px solid #999", borderRadius: 6, cursor: "pointer" }}>
          Conectar conta
        </button>
      </div>
    </main>
  )
}
