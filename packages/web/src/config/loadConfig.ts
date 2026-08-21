import type { AppConfig, DiagramaConfig, FieldSpec, RegrasConfig } from "@gerador/engine";
import { apiCamposAresta, apiCamposNo, type CampoAresta, type CampoNo, apiRegras } from "../api/client";

export interface ConfigCarregada {
  diagramaConfig: DiagramaConfig;
  appConfig: AppConfig;
  regrasConfig?: RegrasConfig;
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

function comoFieldSpec(campo: CampoNo): FieldSpec {
  return {
    key: campo.key,
    label: campo.label,
    type: campo.type,
    required: campo.required || undefined,
    default: campo.valorPadrao ?? undefined,
    options: campo.opcoes ?? undefined,
    ajuda: campo.ajuda ?? undefined,
    permiteNA: campo.permiteNA || undefined,
    itemSpec: campo.itemSpec ?? undefined,
  };
}

function comoFieldSpecAresta(campo: CampoAresta): FieldSpec {
  return {
    key: campo.key,
    label: campo.label,
    type: campo.type,
    required: campo.required || undefined,
    default: campo.valorPadrao ?? undefined,
    options: campo.opcoes ?? undefined,
    ajuda: campo.ajuda ?? undefined,
  };
}

/**
 * Campos globais + do time ativo (`campos_no` no @gerador/server, SPEC-08 §3)
 * se sobrepõem ao `spec` estático de `diagrama.json` por `key` — mesma regra de
 * override que perfis de time já usa. Sem `timeAtivo` (ex.: tela de login ainda
 * não passou), mescla só o que é global.
 */
function mesclarCamposCustomizados(diagramaConfig: DiagramaConfig, campos: CampoNo[]): DiagramaConfig {
  const nodeTypes = { ...diagramaConfig.nodeTypes };
  for (const campo of campos) {
    const cfg = nodeTypes[campo.tipoNo];
    if (!cfg) continue; // tipo de nó desconhecido (campo órfão de um tipo removido) — ignora, não quebra a config
    const fieldSpec = comoFieldSpec(campo);
    const idx = cfg.spec.findIndex((f) => f.key === campo.key);
    const spec = idx >= 0 ? cfg.spec.map((f, i) => (i === idx ? fieldSpec : f)) : [...cfg.spec, fieldSpec];
    nodeTypes[campo.tipoNo] = { ...cfg, spec };
  }
  return { ...diagramaConfig, nodeTypes };
}

/** Mesma regra de override de `mesclarCamposCustomizados`, pra `edgeTypes` (SPEC-21). */
function mesclarCamposCustomizadosAresta(diagramaConfig: DiagramaConfig, campos: CampoAresta[]): DiagramaConfig {
  const edgeTypes = { ...diagramaConfig.edgeTypes };
  for (const campo of campos) {
    const cfg = edgeTypes[campo.tipoAresta];
    if (!cfg) continue;
    const fieldSpec = comoFieldSpecAresta(campo);
    const specAtual = cfg.spec ?? [];
    const idx = specAtual.findIndex((f) => f.key === campo.key);
    const spec = idx >= 0 ? specAtual.map((f, i) => (i === idx ? fieldSpec : f)) : [...specAtual, fieldSpec];
    edgeTypes[campo.tipoAresta] = { ...cfg, spec };
  }
  return { ...diagramaConfig, edgeTypes };
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
  const [diagramaConfig, appConfig, regrasConfig, camposCustomizados, camposArestaCustomizados] = await Promise.all([
    buscarJson<DiagramaConfig>("/config/diagrama.json"),
    buscarJson<AppConfig>("/config/app.json"),
    // O DOCUMENTO editável (banco, com override da RegrasTab) — não o JSON
    // estático do bundle. Achado real do E2E da SPEC-36: a regra criada pela
    // aba nunca chegava na ficha do item, porque a revisão lia o arquivo
    // servido e a aba gravava no banco. O estático fica de fallback.
    apiRegras
      .obterComDiagnostico()
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
  ]);
  const comCamposNo = mesclarCamposCustomizados(diagramaConfig, camposCustomizados);
  const comCamposAresta = mesclarCamposCustomizadosAresta(comCamposNo, camposArestaCustomizados);
  return { diagramaConfig: comCamposAresta, appConfig, regrasConfig };
}
