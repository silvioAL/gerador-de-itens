import { comCofreDeSegredos } from "@gerador/aplicacao";
import { criarProvedorCompativelOpenAI, type ProvedorIa } from "@gerador/llm/gateway";
import type { OpcoesApp } from "../app.js";
import { criarCofreInfisical, opcoesDoAmbiente } from "../adaptadores/cofreInfisical.js";
import { criarRepositorioDeCredenciaisEmPostgres } from "../adaptadores/credenciaisEmPostgres.js";
import { organizacoes } from "../db/schema.js";
import { credencialEmVigor } from "./credencialEmVigor.js";

/**
 * SPEC-105 fatia D — a credencial da organização virando um `ProvedorIa`,
 * fora de `routes/ia.ts`.
 *
 * O executor de fluxo precisa chamar o modelo pelo MESMO caminho da esteira
 * (cofre quando existe, banco quando não, dublê quando declarado) — e o
 * caminho morava inteiro dentro do registrador de rotas de IA. Extraído para
 * cá; `ia.ts` mantém a cópia dele por ora (o arquivo carrega um byte NUL que
 * torna qualquer edição ali arriscada — dívida anotada no JOURNEY §363).
 *
 * `null` = sem organização ou sem credencial — quem chama decide a frase.
 */
export function criarResolvedorDeProvedor(db: OpcoesApp["db"]) {
  // Uma instância só, como em `ia.ts`: o cofre cacheia o token de acesso.
  const opcoesDoCofre = opcoesDoAmbiente();
  const cofre = opcoesDoCofre ? criarCofreInfisical(opcoesDoCofre) : null;

  return async (): Promise<ProvedorIa | null> => {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    if (!org) return null;
    const doBanco = criarRepositorioDeCredenciaisEmPostgres(db, org.id);
    const repo = cofre ? comCofreDeSegredos(doBanco, cofre) : doBanco;
    const emVigor = credencialEmVigor(await repo.obter("gateway"));
    if (!emVigor) return null;
    const credencial = emVigor.credencial;
    return criarProvedorCompativelOpenAI({
      baseUrl: credencial.baseUrl!,
      chave: credencial.chave!,
      modelo: credencial.modelo!,
      cabecalhos: credencial.cabecalhos,
      formatoJson: credencial.formatoJson as never,
      baseUrlTranscricao: credencial.baseUrlTranscricao,
    });
  };
}
