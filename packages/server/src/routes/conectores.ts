import type { FastifyInstance } from "fastify";
import {
  conectoresEmVigor,
  criarCasosDeUsoDeConfig,
  EntradaDoConectorInvalida,
  normalizarExportador,
  type ConectorEmVigor,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { executarConector, FalhaDoConector } from "../adaptadores/executorDeConector.js";
import { exigirNivel } from "../auth/niveis.js";
import { registrarAuditoria } from "../auditoria.js";
import { templateDaVersao } from "../config/templateDaVersao.js";

/**
 * SPEC-105 fatias A/B — o catálogo em vigor e o executor de um passo.
 *
 * O CRUD dos conectores DECLARADOS não mora aqui: é a chave `conectores` na
 * rota genérica `GET/PUT /config/:chave` — esse é o ponto da fatia A, uma
 * integração nova custa uma linha de configuração, não uma rota. O que este
 * arquivo acrescenta é o que a rota genérica não tem como dar:
 *
 * - `GET /conectores` — o catálogo EM VIGOR (declarados + derivados dos
 *   destinos do gateway), resolvido no servidor porque resolução de config é
 *   do servidor (§263, §354) — e **sem os cabeçalhos**, porque segredo de
 *   conector não tem por que passear (§7).
 * - `POST /conectores/:id/executar` — o passo único da fatia B.
 */
export async function registrarRotasConectores(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));

  async function catalogoEmVigor(): Promise<ConectorEmVigor[]> {
    const [exportador, conectores] = await Promise.all([
      casos.obter("exportador", await templateDaVersao("exportador", diretorioConfig)),
      casos.obter("conectores", await templateDaVersao("conectores", diretorioConfig)),
    ]);
    return conectoresEmVigor(normalizarExportador(exportador.documento), conectores.documento);
  }

  // Leitura aberta, como `GET /config/:chave`: o catálogo é vocabulário. O que
  // NÃO sai é o segredo — cada conector vai sem `cabecalhos`, só com o aviso
  // de que os tem.
  app.get("/conectores", async () => {
    const catalogo = await catalogoEmVigor();
    return {
      conectores: catalogo.map(({ cabecalhos, ...conector }) => ({
        ...conector,
        temCabecalhos: Object.keys(cabecalhos).length > 0,
      })),
    };
  });

  /**
   * Executar age no mundo, então o portão é o MESMO das operações do gateway
   * que já agem no mundo (`exportar`, `publicar`, `importar adr`): nível
   * `operar` — trabalho do dia, não configuração. Os recursos RBAC próprios de
   * fluxo (`fluxos`, `fluxos.executar`, §9.1) entram com as fatias C/D, quando
   * existir fluxo para gatear.
   */
  app.post(
    "/conectores/:id/executar",
    { preHandler: exigirNivel(db, "operar") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = (req.body ?? {}) as { parametros?: Record<string, unknown> };

      const conector = (await catalogoEmVigor()).find((c) => c.id === id);
      if (!conector) {
        return reply.code(404).send({ erro: `não conheço o conector "${id}" — veja GET /conectores` });
      }

      let resultado;
      try {
        resultado = await executarConector(conector, corpo.parametros ?? {});
      } catch (erro) {
        if (erro instanceof EntradaDoConectorInvalida) return reply.code(400).send({ erro: erro.message });
        if (erro instanceof FalhaDoConector) {
          // 502: quem falhou foi o outro lado (ou o caminho até ele) — o
          // conector estava bem configurado o bastante para ser chamado.
          return reply.code(502).send({ erro: erro.message });
        }
        throw erro;
      }

      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "executar",
        recurso: "conectores",
        recursoId: id,
      });
      return { conector: id, ...resultado };
    }
  );
}
