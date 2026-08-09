import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { listarPlaceholders, respostaVisivel } from "../refinamento/gerarRefinamento.js";
import { nosDeOrigem } from "../especificacao/gerarEspecificacaoEntrega.js";

/**
 * SPEC-26 Bloco 4a — o revisor determinístico.
 *
 * A dor: *"não esquecer coisas"*. A escolha de desenho: **as checagens que dá
 * pra computar não devem depender de modelo nenhum.** Um item sem regra de
 * teste aplicável, uma dependência apontando pra item que não existe mais, um
 * campo obrigatório em branco — nada disso é opinião, é conta. Deixar essas
 * verificações a cargo do LLM é trocar certeza por probabilidade de graça (e,
 * no modelo local, por vários minutos de espera).
 *
 * A camada semântica (Bloco 4b: critérios que não cobrem um erro do contrato,
 * história que contradiz o épico) é outra coisa, e vem depois — ali o modelo
 * é a única ferramenta possível.
 *
 * Princípio que vale pras duas: **o revisor não escreve nada. Ele aponta.**
 */

export type SeveridadeAchado = "erro" | "aviso";

export interface Achado {
  /** Item onde o problema está — a UI usa isso pra levar a pessoa até lá. */
  atividadeChave: string;
  /** Chave do placeholder, quando o achado é sobre um campo específico. */
  campo?: string;
  severidade: SeveridadeAchado;
  /** Slug estável da regra — pra UI agrupar e pra teste asseverar sem
   * depender do texto da mensagem. */
  regra: string;
  mensagem: string;
}

/** Campos de volumetria que o formato exigido pelo agente validador pede
 * (`gerarRefinamento.ts`) — aqui só interessa saber se ficaram em branco. */
function ehCampoDeVolumetria(chave: string): boolean {
  return chave.includes("::volumetria::");
}

/**
 * Roda todas as checagens determinísticas sobre a quebra derivada.
 *
 * `respostas` é o `respostasItens` da quebra (chave da atividade → chave do
 * placeholder → valor). Sem ele, as checagens sobre preenchimento não
 * acusam nada: um item recém-derivado não é um item com problema.
 */
export function revisarQuebra(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig,
  respostas?: Record<string, Record<string, ValorSpec>>
): Achado[] {
  const achados: Achado[] = [];
  const chavesExistentes = new Set(atividades.map((a) => a.chave));

  for (const atividade of atividades) {
    const respostasDoItem = respostas?.[atividade.chave] ?? {};

    // 1. Dependência apontando pra item que não existe mais. Acontece de
    //    verdade: apagar um nó do desenho remove o item dele, mas quem
    //    dependia continua apontando — e isso some no meio da lista.
    for (const dep of atividade.dependencias) {
      if (dep.alvoChave && !chavesExistentes.has(dep.alvoChave)) {
        achados.push({
          atividadeChave: atividade.chave,
          severidade: "erro",
          regra: "dependencia-orfa",
          mensagem: `Depende de "${dep.alvoChave}", que não existe mais na quebra.`,
        });
      }
    }

    // 2. Campo obrigatório do tipo de nó em branco. O semáforo de prontidão
    //    já cobre isso no canvas; aqui aparece do lado de quem vai escrever o
    //    item, que é onde a falta atrapalha.
    for (const no of nosDeOrigem(atividade, diagrama)) {
      const spec = config.nodeTypes[no.type]?.spec ?? [];
      for (const campo of spec) {
        if (!campo.required) continue;
        // `specNA` é a saída legítima de "não se aplica" — não é lacuna.
        if (no.specNA?.[campo.key]) continue;
        const valor = (no.spec?.[campo.key] as ValorSpec | undefined)?.valor;
        const vazio = valor === undefined || valor === null || valor === "" ||
          (Array.isArray(valor) && valor.length === 0);
        if (vazio) {
          achados.push({
            atividadeChave: atividade.chave,
            severidade: "erro",
            regra: "campo-obrigatorio-vazio",
            mensagem: `O campo obrigatório "${campo.label}" do nó "${no.label || no.id}" está em branco.`,
          });
        }
      }
    }

    if (!regras) continue;

    const placeholders = listarPlaceholders(
      regras,
      atividade.techs,
      atividade.contextos,
      nosDeOrigem(atividade, diagrama),
      diagrama.edges
    );

    // 3. Volumetria exigida e em branco. O bloco só aparece quando alguma
    //    tech do item o exige (`RegrasPorTech.volumetria`), então a presença
    //    do placeholder já é a regra — o que falta é o número.
    for (const p of placeholders) {
      if (!ehCampoDeVolumetria(p.chave)) continue;
      if (!respostaVisivel(respostasDoItem[p.chave])) {
        achados.push({
          atividadeChave: atividade.chave,
          campo: p.chave,
          severidade: "aviso",
          regra: "volumetria-sem-valor",
          mensagem: `Volumetria exigida para este item, mas "${p.rotulo}" está sem valor.`,
        });
      }
    }

    // 4. Item sem NENHUM ciclo de teste aplicável. Não é sobre o item estar
    //    incompleto — é sobre a CONFIGURAÇÃO não cobrir aquela combinação de
    //    tech e contexto, o que passa despercebido justamente por não gerar
    //    nada na tela.
    const temTeste = atividade.techs.some((tech) =>
      (regras.porTech[tech]?.testes ?? []).some(
        (t) => t.contextos.length === 0 || t.contextos.some((c) => atividade.contextos.some((ac) => ac.includes(c) || c.includes(ac)))
      )
    );
    if (!temTeste && atividade.techs.length > 0) {
      achados.push({
        atividadeChave: atividade.chave,
        severidade: "aviso",
        regra: "sem-ciclo-de-teste",
        mensagem: `Nenhum ciclo de teste configurado cobre ${atividade.techs.join("/")}${
          atividade.contextos.length ? ` em ${atividade.contextos.join(", ")}` : ""
        }.`,
      });
    }

    // 5. Item grande não quebrado. A regra existe no template que o usuário
    //    já usa, e hoje depende do MODELO obedecer — o que é exatamente o
    //    tipo de coisa que não deveria depender de modelo.
    if (atividade.tamanho === "G") {
      achados.push({
        atividadeChave: atividade.chave,
        severidade: "aviso",
        regra: "item-grande",
        mensagem: `Item tamanho G: avalie quebrar em itens menores antes de levar pro time.`,
      });
    }
  }

  return achados;
}

/** Contagem por severidade — o que o cabeçalho da revisão mostra. */
export function resumirAchados(achados: Achado[]): { erros: number; avisos: number } {
  return {
    erros: achados.filter((a) => a.severidade === "erro").length,
    avisos: achados.filter((a) => a.severidade === "aviso").length,
  };
}
