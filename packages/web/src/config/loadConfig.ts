import type { AppConfig, DiagramaConfig, RegrasConfig, Token } from "@gerador/engine";
import { mesclarCamposDeAresta, mesclarCamposDeNo } from "@gerador/aplicacao";
import {
  apiCamposAresta,
  apiCamposNo,
  type CampoAresta,
  type CampoNo,
  apiRegras,
  apiTokens,
  apiDiagrama,
} from "../api/client";

export interface ConfigCarregada {
  diagramaConfig: DiagramaConfig;
  appConfig: AppConfig;
  regrasConfig?: RegrasConfig;
  /** SPEC-79 fatia A — os tokens do design system do time (vazio = nao configurado). */
  tokens: Token[];
}

async function buscarJson<T>(caminho: string): Promise<T> {
  const resposta = await fetch(caminho);
  if (!resposta.ok) {
    throw new Error(
      `Não foi possível carregar "${caminho}" (HTTP ${resposta.status}). Confirme que a pasta config/ está montada no container (docker compose) e que o servidor está no ar.`
    );
  }
  return (await resposta.json()) as T;
}

async function buscarJsonOpcional<T>(caminho: string): Promise<T | undefined> {
  try {
    const resposta = await fetch(caminho);
    if (!resposta.ok) return undefined;
    return (await resposta.json()) as T;
  } catch {
    return undefined;
  }
}

/**
 * A mescla dos campos customizados (SPEC-08 §3 / SPEC-21) saiu daqui e virou
 * `mesclarCamposDeNo`/`mesclarCamposDeAresta` na aplicação (SPEC-107 fatia A):
 * o servidor passou a montar o MESMO vocabulário para a função `derivacao`, e
 * duas mesclas divergiriam na primeira mudança (§263). `CampoNo`/`CampoAresta`
 * do client já têm a forma estrutural que a mescla lê.
 */
function mesclarCamposCustomizados(diagramaConfig: DiagramaConfig, campos: CampoNo[]): DiagramaConfig {
  return mesclarCamposDeNo(diagramaConfig, campos);
}

function mesclarCamposCustomizadosAresta(diagramaConfig: DiagramaConfig, campos: CampoAresta[]): DiagramaConfig {
  return mesclarCamposDeAresta(diagramaConfig, campos);
}

/**
 * Carrega config/ em runtime (fetch, nunca import estático) — o mesmo bundle
 * estático precisa servir qualquer instalação, não só o config de exemplo deste
 * repositório. Quem expõe `config/*.json` em `/config/` muda por ambiente
 * (middleware do Vite em dev, volume montado no nginx no Docker) — este módulo
 * não sabe nem precisa saber qual dos dois está servindo.
 *
 * `timeAtivo` mescla os campos customizados desse time (SPEC-08 §3) por cima do
 * `spec` estático — recarregar com um `timeAtivo` novo é como o app reage a
 * troca de time ativo (App.tsx chama de novo quando isso muda).
 */
export async function carregarConfig(timeAtivo?: string): Promise<ConfigCarregada> {
  const [diagramaConfig, appConfig, regrasConfig, camposCustomizados, camposArestaCustomizados, tokens] =
    await Promise.all([
    /**
     * §354 — o diagrama vem RESOLVIDO do servidor (arquivo + o que a
     * organização sobrescreveu). O `catch` cai no arquivo estático: servidor
     * fora do ar não pode deixar o canvas sem vocabulário, e o arquivo é
     * exatamente o comportamento de antes desta rota existir.
     */
    apiDiagrama.obter<DiagramaConfig>().catch(() => buscarJson<DiagramaConfig>("/config/diagrama.json")),
    buscarJson<AppConfig>("/config/app.json"),
    // O DOCUMENTO editável (banco, com override da RegrasTab) — não o JSON
    // estático do bundle. Achado real do E2E da SPEC-36: a regra criada pela
    // aba nunca chegava na ficha do item, porque a revisão lia o arquivo
    // servido e a aba gravava no banco. O estático fica de fallback.
    // §303 — com o time: o servidor resolve time → global → template, então um
    // time sem régua própria segue lendo a da casa.
    apiRegras
      .obterComDiagnostico(timeAtivo)
      .then((envelope) => envelope.documento as RegrasConfig)
      .catch(() => buscarJsonOpcional<RegrasConfig>("/config/regras.json")),
    apiCamposNo.listar(timeAtivo),
    /**
     * O `catch` não é sobre rota faltando — é sobre BLAST RADIUS.
     *
     * §280: este comentário dizia que `/campos-aresta` "só existe no modo
     * local" e que `packages/server` ficava dormente sem essa rota. As duas
     * coisas deixaram de ser verdade (o modo local morreu na SPEC-33, e
     * `routes/camposAresta.ts` existe), e um comentário que descreve o
     * contrário do código manda a próxima pessoa remover o `catch` — ou
     * escrever uma rota que já está lá.
     *
     * O que se preserva é o achado real que o pôs aqui: qualquer falha nesta
     * chamada rejeitava o `Promise.all` inteiro e derrubava o carregamento da
     * config para TODO MUNDO, não só para quem usaria o editor de campos de
     * aresta. Falha aqui = "nenhum campo customizado de aresta", nunca uma
     * tela em branco.
     */
    apiCamposAresta.listar(timeAtivo).catch(() => []),
    /**
     * SPEC-79 fatia A — os tokens do design system do time.
     *
     * `catch` pelo mesmo motivo de blast radius do vizinho acima, e com um
     * agravante: **time sem design system configurado é o caso comum**, não a
     * exceção. Falha aqui significa "nenhum token declarado", e a régua se cala
     * sozinha em `avaliarConformidade` — nunca uma tela em branco, e nunca uma
     * organização acusada por não ter configurado algo que acabou de existir.
     */
    apiTokens
      .obter(timeAtivo)
      .then((c) => c?.tokens ?? [])
      .catch(() => [] as Token[]),
  ]);
  const comCamposNo = mesclarCamposCustomizados(diagramaConfig, camposCustomizados);
  const comCamposAresta = mesclarCamposCustomizadosAresta(comCamposNo, camposArestaCustomizados);
  return { diagramaConfig: comCamposAresta, appConfig, regrasConfig, tokens };
}

