import {
  mapearSaidaDoConector,
  montarChamadaDoConector,
  type Conector,
  type SaidaDoConector,
} from "@gerador/aplicacao";

/**
 * SPEC-105 fatia B — o executor de UM passo, do lado que tem rede.
 *
 * A montagem da chamada e a leitura da resposta são puras e moram na
 * aplicação (`casos-de-uso/conectores.ts`); aqui só o transporte. **O executor
 * é do servidor** (§7): `cabecalhos` carrega segredo da organização, e um
 * token que chega ao browser vaza.
 *
 * O modo de falhar é o do publicador, não o do leitor de ADR: quem executa um
 * conector à mão quer saber POR QUE não deu — engolir a falha e devolver vazio
 * seria a mentira perfeita, idêntica a um endpoint que respondeu nada.
 */
export class FalhaDoConector extends Error {
  constructor(
    mensagem: string,
    readonly status?: number
  ) {
    super(mensagem);
    this.name = "FalhaDoConector";
  }
}

export async function executarConector(
  conector: Conector,
  parametros: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<SaidaDoConector> {
  // Lança `EntradaDoConectorInvalida` (§9.3) — a rota converte em 400.
  const chamada = montarChamadaDoConector(conector, parametros);

  let resposta: Response;
  try {
    resposta = await fetchImpl(chamada.endpoint, {
      method: chamada.metodo,
      headers: chamada.cabecalhos,
      body: chamada.corpo,
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new FalhaDoConector(`não consegui falar com ${conector.nome || conector.endpoint}: ${motivo}`);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new FalhaDoConector(
      `${conector.nome || conector.endpoint} respondeu HTTP ${resposta.status}${corpo ? ` — ${corpo.slice(0, 200)}` : ""}`,
      resposta.status
    );
  }

  const corpo = await resposta.json().catch(() => ({}));
  return mapearSaidaDoConector(conector, corpo);
}
