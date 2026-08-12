import type { DiagramaConfig } from "@gerador/engine";

/**
 * SPEC-36 Opção A — a projeção por componente na CRIAÇÃO de regras.
 *
 * O documento continua `porTech` (motor, RBAC e diagnóstico intactos); o que
 * muda é o vocabulário de quem cria: escolhe-se um COMPONENTE ("Fila Rabbit")
 * e o mapeamento deriva tech + contexto sozinho. O segundo select ("vale
 * para") é exatamente escolher entre contexto exato, família de contextos
 * (prefixo) e tech inteira — com nomes legíveis.
 */
export interface OpcaoDeEscopo {
  rotulo: string;
  /** Os contextos que a regra recebe — vazio = vale para a tech inteira. */
  contextos: string[];
}

export interface ProjecaoDoComponente {
  tech: string;
  opcoes: OpcaoDeEscopo[];
}

/** A família de um contexto é a parte antes do primeiro espaço:
 * "Backend-mensagens rabbitmq" → "Backend-mensagens". É a convenção medida
 * em toda a config (SPEC-36 §2). */
function familiaDe(contexto: string): string {
  return contexto.split(" ")[0];
}

export function escoposDoComponente(
  tipoNo: string,
  nodeTypes: DiagramaConfig["nodeTypes"],
  todosOsContextos: string[]
): ProjecaoDoComponente | null {
  const tipo = nodeTypes[tipoNo];
  if (!tipo) return null;
  const tech = tipo.techs?.[0];
  if (!tech) return null;

  const opcoes: OpcaoDeEscopo[] = [];
  const contextosDoTipo = tipo.contextos ?? [];

  if (contextosDoTipo.length > 0) {
    opcoes.push({ rotulo: `só ${tipo.label}`, contextos: [...contextosDoTipo] });

    // A família (ex.: toda a mensageria) só aparece quando alarga de verdade:
    // existem OUTROS contextos na config sob o mesmo prefixo.
    const familias = [...new Set(contextosDoTipo.map(familiaDe))];
    const daFamilia = [...new Set(todosOsContextos.filter((c) => familias.some((f) => familiaDe(c) === f)))];
    if (daFamilia.length > contextosDoTipo.length) {
      const nomeDaFamilia = familias.map((f) => f.replace(new RegExp(`^${tech}-`, "i"), "")).join(", ");
      opcoes.push({ rotulo: `todo o grupo ${nomeDaFamilia}`, contextos: daFamilia });
    }
  }

  opcoes.push({ rotulo: `todo ${tech}`, contextos: [] });
  return { tech, opcoes };
}

/** A leitura inversa: quais componentes uma regra alcança, dado o conjunto de
 * contextos dela (vazio = todos os componentes da tech). */
export function componentesAlcancados(
  tech: string,
  contextosDaRegra: string[],
  nodeTypes: DiagramaConfig["nodeTypes"]
): string[] {
  return Object.values(nodeTypes)
    .filter((tipo) => (tipo.techs ?? []).includes(tech))
    .filter(
      (tipo) =>
        contextosDaRegra.length === 0 || (tipo.contextos ?? []).some((c) => contextosDaRegra.includes(c))
    )
    .map((tipo) => tipo.label);
}
