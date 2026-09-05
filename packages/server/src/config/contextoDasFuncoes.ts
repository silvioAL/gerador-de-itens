import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DiagramaConfig, RegrasConfig, Token } from "@gerador/engine";
import {
  aplicarRegrasDeConexao,
  criarCasosDeUsoDeCamposAresta,
  criarCasosDeUsoDeCamposNo,
  criarCasosDeUsoDeConfig,
  mesclarCamposDeAresta,
  mesclarCamposDeNo,
  type ContextoDasFuncoes,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeCamposArestaEmPostgres } from "../adaptadores/camposArestaEmPostgres.js";
import { criarRepositorioDeCamposNoEmPostgres } from "../adaptadores/camposNoEmPostgres.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { templateDaVersao } from "./templateDaVersao.js";

/**
 * SPEC-107 fatia A — **o vocabulário do time, montado no servidor.**
 *
 * A função `derivacao` promete o byte a byte com o botão da mesa (§263), e o
 * botão deriva no NAVEGADOR com o vocabulário que `loadConfig.ts` monta:
 * diagrama resolvido + campos customizados de nó/aresta + regras + tokens do
 * time. Este módulo monta as MESMAS cinco fontes, pelas MESMAS funções — a
 * resolução do diagrama é a da rota `GET /config/diagrama`, a mescla é
 * `mesclarCamposDeNo`/`mesclarCamposDeAresta` (aplicação), e regras/tokens
 * saem dos mesmos casos de uso de config. Divergência aqui não é bug sutil:
 * é a prova da fatia quebrando.
 */

/** Mesmo fallback `.json` → `.example.json` de `templateDaVersao` e das
 * rotas de config/quebras: este repositório só tem os templates de exemplo. */
async function lerJsonDeConfig<T>(diretorio: string, nome: string): Promise<T | null> {
  for (const candidato of [nome, nome.replace(/\.json$/, ".example.json")]) {
    try {
      return JSON.parse(await readFile(resolve(diretorio, candidato), "utf-8")) as T;
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

export async function contextoDasFuncoes(
  db: OpcoesApp["db"],
  diretorioConfig: string,
  timeId?: string
): Promise<ContextoDasFuncoes> {
  const casosConfig = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
  const casosCamposNo = criarCasosDeUsoDeCamposNo(criarRepositorioDeCamposNoEmPostgres(db));
  const casosCamposAresta = criarCasosDeUsoDeCamposAresta(criarRepositorioDeCamposArestaEmPostgres(db));

  const [estatico, conexoes, regras, tokens, camposNo, camposAresta] = await Promise.all([
    lerJsonDeConfig<DiagramaConfig>(diretorioConfig, "diagrama.json"),
    casosConfig.obter("conexoes", await templateDaVersao("conexoes", diretorioConfig)),
    casosConfig.obter("regras", await templateDaVersao("regras", diretorioConfig), timeId),
    casosConfig.obter("tokens", await templateDaVersao("tokens", diretorioConfig), timeId),
    casosCamposNo.listarEfetivos(timeId),
    casosCamposAresta.listarEfetivos(timeId),
  ]);
  if (!estatico) {
    // Sem o arquivo não há vocabulário nenhum — derivar com `{}` produziria
    // zero itens "com sucesso", que é a invenção da §9.3 de outro jeito.
    throw new Error("config/diagrama.json não encontrado no servidor — sem vocabulário não há derivação");
  }

  const resolvido = aplicarRegrasDeConexao(estatico, conexoes.documento) as DiagramaConfig;
  const diagramaConfig = mesclarCamposDeAresta(mesclarCamposDeNo(resolvido, camposNo), camposAresta);

  return {
    diagramaConfig,
    regrasConfig: (regras.documento as RegrasConfig | null) ?? undefined,
    tokens: (tokens.documento as { tokens?: Token[] } | null)?.tokens ?? [],
  };
}
