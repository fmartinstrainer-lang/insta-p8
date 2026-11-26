// No Cloudflare Workers não há leitura de arquivo em tempo de execução.
// O schema.sql já foi aplicado no Supabase pelo editor SQL; aqui fica só um no-op.
export async function ensureSchema(): Promise<void> {}
