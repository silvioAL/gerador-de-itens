import { nomeDoSegredoDeCredencial, type CofreDeSegredos } from "../portas/cofreDeSegredos.js";
import {
  resumirCredencialIa,
  type CredencialIa,
  type RepositorioDeCredenciais,
} from "../portas/repositorioDeCredenciais.js";

/**
 * SPEC-54 — a chave sai do banco e vai para o cofre, sem que ninguém acima
 * perceba.
 *
 * Decorator sobre o repositório que já existe: o que é SEGREDO (a chave) mora
 * no cofre; o que é CONFIGURAÇÃO (endereço, modelo, cabeçalhos, flags)
 * continua no banco, porque a tela precisa disso para se desenhar e endereço
 * de gateway não é segredo.
 *
 * Quem chama `obter`/`salvar`/`resumir` continua sem saber de onde vem a
 * chave — é a porta que não muda que torna o cofre trocável.
 */
export function comCofreDeSegredos(
  repositorio: RepositorioDeCredenciais,
  cofre: CofreDeSegredos
): RepositorioDeCredenciais {
  /**
   * A migração da §3.3, e ela acontece na LEITURA de propósito: é o único
   * momento em que se sabe que existe chave velha no banco. Fazer isso num
   * script de boot exigiria varrer a tabela inteira e adivinhar quais
   * organizações existem.
   */
  async function chaveDoProvedor(provedorId: string, doBanco: CredencialIa | null): Promise<string | undefined> {
    const nome = nomeDoSegredoDeCredencial(provedorId);
    const noCofre = await cofre.ler(nome);
    if (noCofre) return noCofre;

    if (doBanco?.chave) {
      // Move: grava no cofre e limpa a coluna. A ordem importa — gravar antes
      // de apagar significa que uma falha no meio deixa a chave nos dois
      // lugares (recuperável), nunca em nenhum (perdida).
      await cofre.gravar(nome, doBanco.chave);
      await repositorio.salvar(provedorId, { ...doBanco, chave: undefined });
      return doBanco.chave;
    }
    return undefined;
  }

  return {
    async obter(provedorId) {
      const doBanco = await repositorio.obter(provedorId);
      const chave = await chaveDoProvedor(provedorId, doBanco);
      if (!doBanco && !chave) return null;
      return { ...(doBanco ?? {}), chave };
    },

    async salvar(provedorId, credencial) {
      const { chave, ...configuracao } = credencial;
      const nome = nomeDoSegredoDeCredencial(provedorId);

      if (chave) {
        await cofre.gravar(nome, chave);
      }
      // Chave ausente NÃO apaga o segredo: a tela manda o formulário inteiro a
      // cada salvar, e o campo de chave vem vazio quando ninguém o tocou (é
      // mascarado). Apagar aqui foi exatamente o defeito da §191, um nível
      // abaixo — quem quer remover a credencial usa a remoção explícita.
      await repositorio.salvar(provedorId, { ...configuracao, chave: undefined });
    },

    async resumir(provedorId) {
      // Pelo `obter` decorado, e não pelo `resumir` do banco: o banco não tem
      // mais a chave, e resumir por lá diria "não configurado" para quem está
      // configurado — a tela então ofereceria configurar por cima.
      return resumirCredencialIa(await this.obter(provedorId));
    },
  };
}
