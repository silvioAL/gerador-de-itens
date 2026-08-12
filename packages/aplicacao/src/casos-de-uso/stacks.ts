import type { RepositorioDeStacks, Stack, SugestoesDeStack } from "../portas/repositorioDeStacks.js";

/**
 * SPEC-43 — casos de uso de stacks conhecidas. A agregação de sugestões e o
 * nome derivado da captura são REGRA (moram aqui, puros); o repositório só
 * guarda e devolve.
 */

/** "Java + Spring Boot" a partir de {linguagem: Java, framework: Spring Boot}
 * — campos em ordem DESC (linguagem antes de framework) para o nome ler na
 * ordem natural. Mesma regra da migração 0026, para o dado convertido e o
 * capturado nascerem iguais. */
export function nomeDerivadoDosValores(valores: Record<string, string>): string {
  return Object.entries(valores)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, valor]) => valor)
    .join(" + ");
}

export function criarCasosDeUsoDeStacks(repo: RepositorioDeStacks) {
  return {
    catalogo(): Promise<Stack[]> {
      return repo.catalogo();
    },

    /** O agregado dos chips: todo valor de toda stack, por tipo e campo. */
    async sugestoes(): Promise<SugestoesDeStack> {
      const sugestoes: SugestoesDeStack = {};
      for (const stack of await repo.catalogo()) {
        for (const [campo, valor] of Object.entries(stack.valores)) {
          const doCampo = ((sugestoes[stack.tipoNo] ??= {})[campo] ??= []);
          if (!doCampo.includes(valor)) doCampo.push(valor);
        }
      }
      return sugestoes;
    },

    criar(organizacaoId: string, tipoNo: string, nome: string, criadoPor: string): Promise<Stack> {
      return repo.criar(organizacaoId, tipoNo, nome, criadoPor);
    },

    definirValores(stackId: string, valores: Record<string, string>): Promise<Record<string, string>> {
      return repo.definirValores(stackId, valores);
    },

    /**
     * A captura do painel ("salvar estes valores como stack conhecida"):
     * mescla na stack de mesmo (componente, nome derivado) se existir, senão
     * cria — capturar duas vezes o mesmo ambiente não duplica o catálogo.
     */
    async capturar(
      organizacaoId: string,
      tipoNo: string,
      valores: Record<string, string>,
      criadoPor: string
    ): Promise<Stack> {
      const nome = nomeDerivadoDosValores(valores);
      const existente = (await repo.catalogo()).find((s) => s.tipoNo === tipoNo && s.nome === nome);
      const stack = existente ?? (await repo.criar(organizacaoId, tipoNo, nome, criadoPor));
      const valoresFinais = await repo.definirValores(stack.id, valores);
      return { ...stack, valores: valoresFinais };
    },
  };
}

export type CasosDeUsoDeStacks = ReturnType<typeof criarCasosDeUsoDeStacks>;
