import { ProxyAgent, fetch as fetchUndici, type Dispatcher } from "undici";

/**
 * Rede corporativa: proxy e diagnóstico do download de modelos.
 *
 * ACHADO que motivou este arquivo. Na máquina do usuário, `gerador ia
 * instalar` morria com **`fetch failed`** — três palavras que não dizem nada.
 * A leitura fácil era "a rede bloqueia o Hugging Face", e ela levou a
 * construir um caminho inteiro por npm antes de olhar direito.
 *
 * O que a mensagem escondia: `fetch failed` é o texto genérico do undici, e a
 * causa real mora em `error.cause` (`ENOTFOUND`, `ECONNREFUSED`,
 * `UND_ERR_CONNECT_TIMEOUT`, `CERT_HAS_EXPIRED`…). São diagnósticos
 * completamente diferentes, com ações diferentes, e nenhum deles aparecia.
 *
 * E a hipótese que explica o sintoma mais confuso — *"o npm funciona, o
 * download não"*: **o npm honra proxy** (lê `.npmrc`/env), e o **`fetch` do
 * Node ignora proxy por completo**. Mesmo destino, mesma rede, um passa e o
 * outro não. Não é bloqueio; é o cliente HTTP não estar configurado.
 */

/**
 * De onde o proxy vem, em ordem de precedência. As variáveis `npm_config_*`
 * entram porque o npm as exporta quando roda scripts — e porque quem já
 * configurou proxy pro npm não deveria ter que configurar de novo pra nós.
 */
const FONTES_DE_PROXY = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "npm_config_https_proxy",
  "npm_config_proxy",
] as const;

export interface ProxyDetectado {
  url: string;
  /** Qual variável forneceu — aparece no log, pra pessoa saber o que mexer. */
  origem: string;
}

export function detectarProxy(env: NodeJS.ProcessEnv = process.env): ProxyDetectado | undefined {
  for (const nome of FONTES_DE_PROXY) {
    const url = env[nome]?.trim();
    if (url) return { url, origem: nome };
  }
  return undefined;
}

/** `NO_PROXY=huggingface.co` (ou `*`) precisa ser respeitado — senão forçamos
 * um proxy que a própria rede manda evitar pra esse destino. */
export function proxyIgnoradoPara(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const lista = (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map((s) => s.trim().toLowerCase());
  if (!lista.length) return false;
  if (lista.includes("*")) return true;
  const host = seguroHost(url);
  return lista.some((entrada) => entrada && (host === entrada || host.endsWith(`.${entrada.replace(/^\./, "")}`)));
}

export function dispatcherPara(url: string, env: NodeJS.ProcessEnv = process.env): Dispatcher | undefined {
  if (proxyIgnoradoPara(url, env)) return undefined;
  const proxy = detectarProxy(env);
  return proxy ? new ProxyAgent(proxy.url) : undefined;
}

/**
 * `fetch` que honra proxy — e a razão de não ser o `fetch` global.
 *
 * ACHADO, pego pela validação real e não por teste: passar um `dispatcher` do
 * undici do `node_modules` para o `fetch` **global** estoura com
 * `UND_ERR_INVALID_ARG — invalid onRequestStart method`. O `fetch` global usa o
 * undici **interno do Node**, e as duas cópias não se reconhecem. Tem que ser o
 * `fetch` do mesmo undici que criou o ProxyAgent.
 *
 * Sem proxy, o global serve e é o caminho mais leve — por isso a escolha é
 * condicional em vez de trocar tudo.
 */
export async function buscarComProxy(url: string, init: RequestInit = {}): Promise<Response> {
  const dispatcher = dispatcherPara(url);
  if (!dispatcher) return fetch(url, init);
  return (await fetchUndici(url, { ...init, dispatcher } as Parameters<typeof fetchUndici>[1])) as unknown as Response;
}

/**
 * Transforma o `fetch failed` do Node em algo que diz o que fazer.
 *
 * A regra aqui é a mesma do resto do produto (ver `erroDeGateway` em
 * `provedorOpenAI.ts`): a mensagem tem que dizer o próximo passo, não o nome
 * técnico do erro. A diferença é que aqui o nome técnico TAMBÉM entra — quem
 * vai resolver um problema de rede corporativa precisa dele pra falar com a
 * equipe de infraestrutura.
 */
export function explicarFalhaDeRede(erro: unknown, url: string, env: NodeJS.ProcessEnv = process.env): Error {
  const causa = (erro as { cause?: { code?: string; message?: string } })?.cause;
  const codigo = causa?.code ?? "";
  const detalhe = causa?.message ?? (erro instanceof Error ? erro.message : String(erro));
  const proxy = detectarProxy(env);
  const host = seguroHost(url);

  const semProxy = !proxy
    ? ` Nenhum proxy configurado — se a sua rede exige um, defina HTTPS_PROXY (ex.: HTTPS_PROXY=http://proxy.empresa:8080) e rode de novo. O npm honra proxy sozinho, o download do modelo não honrava até agora, o que faz o npm funcionar e este comando falhar na mesma rede.`
    : ` Usando o proxy de ${proxy.origem} (${proxy.url}).`;

  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") {
    // Com proxy em uso, quem não resolveu é o HOST DO PROXY — a conexão nem
    // chega a tentar o destino. Dizer o nome errado aqui manda a pessoa
    // investigar a caixa errada.
    const quem = proxy ? `o proxy (${seguroHost(proxy.url)})` : host;
    return new Error(`Não consegui resolver ${quem} (${codigo}). É DNS, não bloqueio de conteúdo.${semProxy}`);
  }
  if (codigo === "ECONNREFUSED" || codigo === "UND_ERR_CONNECT_TIMEOUT" || codigo === "ETIMEDOUT") {
    return new Error(`Conexão com ${host} não completou (${codigo}).${semProxy}`);
  }
  if (codigo.startsWith("CERT_") || codigo === "SELF_SIGNED_CERT_IN_CHAIN" || codigo === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    // ACHADO real, na máquina do usuário: era ISTO — inspeção TLS corporativa,
    // não bloqueio de conteúdo e não proxy. A rede intercepta o HTTPS e
    // reassina com uma CA da empresa, que o Node não conhece. É também a
    // explicação final pro "o npm funciona e o download não": o npm usa o
    // repositório de certificados do Windows; o Node, por padrão, não.
    //
    // `--use-system-ca` vem primeiro de propósito. Ele resolve com UMA variável
    // de ambiente, usando a CA que já está instalada na máquina — enquanto
    // NODE_EXTRA_CA_CERTS exige caçar e exportar um .pem, que é onde a maioria
    // das pessoas desiste.
    return new Error(
      `O certificado de ${host} não foi aceito (${codigo}) — sua rede faz inspeção TLS.${
        suportaCaDoSistema()
          ? ` Resolva com: NODE_OPTIONS=--use-system-ca (usa a CA da empresa que já está instalada nesta máquina).`
          : ` Aponte NODE_EXTRA_CA_CERTS pro .pem da CA da empresa (o Node ${process.version} é antigo demais pro --use-system-ca, que precisa de 22.15+).`
      }`
    );
  }
  return new Error(
    `Falha de rede ao baixar de ${host}: ${codigo || "sem código"} — ${detalhe}.${semProxy} Alternativa sem rede: gerador ia instalar --modelo <id> --de <caminho do .gguf>.`
  );
}

/**
 * `--use-system-ca` (usar o repositório de certificados do SO) existe a partir
 * do Node 22.15. Abaixo disso, a única saída é exportar o `.pem` — e dizer o
 * contrário mandaria a pessoa tentar uma flag que o Node dela ignora.
 */
function suportaCaDoSistema(versao = process.versions.node): boolean {
  const [maior = 0, menor = 0] = versao.split(".").map(Number);
  return maior > 22 || (maior === 22 && menor >= 15);
}

function seguroHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}
