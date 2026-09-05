import {
  conectoresEmVigor,
  criarCasosDeUsoDeConfig,
  normalizarExportador,
  type ConectorEmVigor,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { templateDaVersao } from "./templateDaVersao.js";

/**
 * O catálogo de conectores EM VIGOR (declarados + derivados dos destinos do
 * gateway), num lugar só: a rota do catálogo e o executor de fluxo leem a
 * MESMA resolução — duas cópias divergiriam na primeira mudança (§263).
 */
export async function catalogoDeConectores(
  db: OpcoesApp["db"],
  diretorioConfig: string
): Promise<ConectorEmVigor[]> {
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
  const [exportador, conectores] = await Promise.all([
    casos.obter("exportador", await templateDaVersao("exportador", diretorioConfig)),
    casos.obter("conectores", await templateDaVersao("conectores", diretorioConfig)),
  ]);
  return conectoresEmVigor(normalizarExportador(exportador.documento), conectores.documento);
}
