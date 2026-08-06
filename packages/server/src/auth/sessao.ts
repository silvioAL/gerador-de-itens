import { SignJWT, jwtVerify } from "jose";

/** Nome do cookie httpOnly que carrega a sessão assinada. */
export const COOKIE_SESSAO = "gerador_sessao";

const ALGORITMO = "HS256";
const DURACAO = "12h";

export interface ClaimsSessao {
  email: string;
  timeIds: string[];
}

/**
 * Segredo de assinatura do cookie — stateless (sem tabela de sessão), consistente
 * com "deploy simples". O fallback de dev nunca deve chegar em produção (Fase E
 * cuida de exigir `SESSAO_SEGREDO` explícito fora de AUTH_MODE=dev).
 */
function segredo(): Uint8Array {
  const valor = process.env.SESSAO_SEGREDO ?? "dev-segredo-nao-usar-em-producao";
  return new TextEncoder().encode(valor);
}

export async function assinarSessao(claims: ClaimsSessao): Promise<string> {
  return new SignJWT({ email: claims.email, timeIds: claims.timeIds })
    .setProtectedHeader({ alg: ALGORITMO })
    .setIssuedAt()
    .setExpirationTime(DURACAO)
    .sign(segredo());
}

export async function verificarSessao(token: string): Promise<ClaimsSessao | null> {
  try {
    const { payload } = await jwtVerify(token, segredo());
    if (typeof payload.email !== "string" || !Array.isArray(payload.timeIds)) return null;
    return { email: payload.email, timeIds: payload.timeIds as string[] };
  } catch {
    return null;
  }
}
