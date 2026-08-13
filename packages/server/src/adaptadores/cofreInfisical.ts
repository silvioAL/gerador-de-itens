import type { CofreDeSegredos } from "@gerador/aplicacao";

/**
 * SPEC-54 — o cofre de verdade: Infisical self-hosted (o mesmo da SPEC-12).
 *
 * A SPEC-12 decidiu não colocar SDK de vault no servidor, e a decisão continua
 * valendo para os segredos de BOOT — quem os injeta é `infisical run`. A
 * credencial de IA é outro caso: nasce em runtime, pela tela, e precisa ser
 * ESCRITA sem reiniciar o processo. Daí este adaptador, que fala HTTP direto e
 * implementa uma interface de três métodos — trocável por qualquer outro cofre.
 *
 * Sem SDK de propósito: são quatro chamadas HTTP, e uma dependência a mais no
 * bundle CJS do servidor (ver §20/§21) custaria mais do que resolve.
 */
export interface OpcoesCofreInfisical {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  projectId: string;
  ambiente: string;
  /** Onde os segredos ficam dentro do projeto. `/` é a raiz do Infisical. */
  caminho?: string;
  fetchImpl?: typeof fetch;
}

/** Lê a configuração do ambiente. `null` = sem cofre, e o servidor segue com o
 * banco (SPEC-54 §3.2) — ausência de configuração não é erro. */
export function opcoesDoAmbiente(env: NodeJS.ProcessEnv = process.env): OpcoesCofreInfisical | null {
  const { INFISICAL_API_URL, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID, INFISICAL_ENV } = env;
  if (!INFISICAL_API_URL || !INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !INFISICAL_PROJECT_ID) return null;
  return {
    apiUrl: INFISICAL_API_URL.replace(/\/+$/, ""),
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET,
    projectId: INFISICAL_PROJECT_ID,
    ambiente: INFISICAL_ENV || "prod",
    caminho: env.INFISICAL_SECRET_PATH || "/",
  };
}

export class ErroDoCofre extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoCofre";
  }
}

export function criarCofreInfisical(opcoes: OpcoesCofreInfisical): CofreDeSegredos {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const caminho = opcoes.caminho ?? "/";
  let token: { valor: string; expiraEm: number } | null = null;

  /** Universal Auth. O token é cacheado até 60s antes de expirar — renovar a
   * cada chamada faria uma requisição de login por leitura de chave. */
  async function autenticar(): Promise<string> {
    if (token && Date.now() < token.expiraEm) return token.valor;

    const resposta = await fetchImpl(`${opcoes.apiUrl}/api/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: opcoes.clientId, clientSecret: opcoes.clientSecret }),
    }).catch((e: unknown) => {
      throw new ErroDoCofre(`não consegui falar com o cofre: ${e instanceof Error ? e.message : String(e)}`);
    });

    if (!resposta.ok) {
      throw new ErroDoCofre(`o cofre recusou a identidade (HTTP ${resposta.status}) — confira INFISICAL_CLIENT_ID/SECRET`);
    }
    const corpo = (await resposta.json()) as { accessToken?: string; expiresIn?: number };
    if (!corpo.accessToken) throw new ErroDoCofre("o cofre respondeu sem token de acesso");

    token = {
      valor: corpo.accessToken,
      expiraEm: Date.now() + Math.max(0, (corpo.expiresIn ?? 3600) - 60) * 1000,
    };
    return token.valor;
  }

  async function chamar(caminhoUrl: string, init: RequestInit): Promise<Response> {
    const acesso = await autenticar();
    return fetchImpl(`${opcoes.apiUrl}${caminhoUrl}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${acesso}`, ...init.headers },
    }).catch((e: unknown) => {
      throw new ErroDoCofre(`não consegui falar com o cofre: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  const query = () =>
    `workspaceId=${encodeURIComponent(opcoes.projectId)}&environment=${encodeURIComponent(
      opcoes.ambiente
    )}&secretPath=${encodeURIComponent(caminho)}`;

  return {
    async ler(nome) {
      const resposta = await chamar(`/api/v3/secrets/raw/${encodeURIComponent(nome)}?${query()}`, { method: "GET" });
      // 404 é ausência — resposta legítima, não falha. Qualquer outro status
      // de erro SOBE: confundir "não existe" com "cofre fora do ar" faria a
      // tela pedir para configurar uma chave que já está configurada, e o
      // próximo salvar gravaria por cima (SPEC-54 §4).
      if (resposta.status === 404) return null;
      if (!resposta.ok) throw new ErroDoCofre(`o cofre respondeu HTTP ${resposta.status} ao ler "${nome}"`);

      const corpo = (await resposta.json()) as { secret?: { secretValue?: string } };
      return corpo.secret?.secretValue ?? null;
    },

    async gravar(nome, valor) {
      const corpo = JSON.stringify({
        workspaceId: opcoes.projectId,
        environment: opcoes.ambiente,
        secretPath: caminho,
        secretValue: valor,
      });
      // O Infisical separa criar (POST) de atualizar (PATCH) e recusa o
      // errado. Tentar atualizar primeiro cobre o caso comum (rotação de uma
      // chave que já existe) com uma chamada só.
      const atualizacao = await chamar(`/api/v3/secrets/raw/${encodeURIComponent(nome)}`, {
        method: "PATCH",
        body: corpo,
      });
      if (atualizacao.ok) return;
      if (atualizacao.status !== 404 && atualizacao.status !== 400) {
        throw new ErroDoCofre(`o cofre respondeu HTTP ${atualizacao.status} ao gravar "${nome}"`);
      }

      const criacao = await chamar(`/api/v3/secrets/raw/${encodeURIComponent(nome)}`, { method: "POST", body: corpo });
      if (!criacao.ok) throw new ErroDoCofre(`o cofre respondeu HTTP ${criacao.status} ao criar "${nome}"`);
    },

    async apagar(nome) {
      const resposta = await chamar(`/api/v3/secrets/raw/${encodeURIComponent(nome)}`, {
        method: "DELETE",
        body: JSON.stringify({ workspaceId: opcoes.projectId, environment: opcoes.ambiente, secretPath: caminho }),
      });
      // Apagar o que não existe é sucesso — a porta promete idempotência.
      if (!resposta.ok && resposta.status !== 404) {
        throw new ErroDoCofre(`o cofre respondeu HTTP ${resposta.status} ao apagar "${nome}"`);
      }
    },
  };
}
