import { Pool } from "pg";
import {
  comLimite,
  mapearSaidaDoConector,
  traduzirConsulta,
  type Conector,
  type SaidaDoConector,
} from "@gerador/aplicacao";
import type { CofreDeSegredos } from "@gerador/aplicacao";
import { FalhaDoConector } from "./executorDeConector.js";

/**
 * SPEC-110 fatia D (D6) — **o executor do conector de BANCO.**
 *
 * A tradução `:param → $n`, o LIMIT forçado e a régua do "só consulta" são
 * PUROS e moram na aplicação (`consultaEmBanco.ts`); aqui mora só o que tem
 * driver: o pool, a transação e o segredo. É a mesma divisão do executor HTTP,
 * e ela é o que permite provar as travas sem um Postgres em pé.
 *
 * ## As quatro travas, e por que nenhuma sozinha basta (R2)
 *
 * 1. **Parâmetros nomeados**: o valor NUNCA entra no texto do SQL. É a única
 *    defesa real contra injeção — as outras três reduzem o estrago.
 * 2. **`SET TRANSACTION READ ONLY`**: a garantia de verdade do "só consulta".
 *    A régua de texto da aplicação é heurística honesta; esta é do Postgres.
 * 3. **`statement_timeout`**: uma consulta que varre a tabela inteira não
 *    trava o fluxo para sempre — ela falha nomeada, em 10s.
 * 4. **LIMIT forçado**: o resultado alimenta um agente ou uma transformação,
 *    não um relatório.
 *
 * ## O cache de pools, com teto
 *
 * Abrir uma conexão por execução seria lento e vazaria descritores; um pool
 * por CONEXÃO (a chave do segredo) é o meio-termo. O teto existe porque um
 * catálogo com muitos bancos abriria pools indefinidamente — e um pool ocioso
 * ainda segura conexões do outro lado.
 */

const TIMEOUT_DA_CONSULTA_MS = 10_000;
const TETO_DE_POOLS = 8;

const pools = new Map<string, Pool>();

/**
 * A variável de ambiente que guarda uma conexão, quando não há cofre. Formato
 * explícito e legível pelo mesmo motivo de `nomeDoSegredoDeCredencial`: quem
 * abre o `docker-compose` precisa entender o que está vendo.
 */
export function nomeDaVariavel(chave: string): string {
  return `GERADOR_CONEXAO_${chave.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
}

function poolPara(chave: string, connectionString: string): Pool {
  const existente = pools.get(chave);
  if (existente) return existente;
  // O mais antigo sai quando o teto estoura (LRU pobre — a ordem do Map é a
  // de inserção). Fechar é assíncrono e o erro é ignorado de propósito: um
  // pool que não fecha não pode derrubar a consulta de quem está esperando.
  if (pools.size >= TETO_DE_POOLS) {
    const maisAntiga = pools.keys().next().value as string | undefined;
    if (maisAntiga) {
      void pools.get(maisAntiga)?.end().catch(() => undefined);
      pools.delete(maisAntiga);
    }
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    // Conectar não pode ficar pendurado: um host errado no segredo daria um
    // fluxo travado em vez de um erro com nome.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Sem este handler, um erro de socket num cliente OCIOSO derruba o processo
  // inteiro (o `pg` emite 'error' no pool, e 'error' sem ouvinte é fatal).
  pool.on("error", () => undefined);
  pools.set(chave, pool);
  return pool;
}

/** Para os testes e o desligamento limpo: nenhum pool sobrevive ao processo. */
export async function fecharPoolsDeConsulta(): Promise<void> {
  const todos = [...pools.values()];
  pools.clear();
  await Promise.all(todos.map((p) => p.end().catch(() => undefined)));
}

export async function executarConsulta(
  conector: Conector,
  parametros: Record<string, unknown>,
  cofre: CofreDeSegredos | null
): Promise<SaidaDoConector> {
  const consulta = conector.banco;
  if (!consulta) throw new FalhaDoConector(`o conector "${conector.id}" não tem consulta declarada`);

  let connectionString: string | null = null;
  if (cofre) {
    try {
      connectionString = await cofre.ler(consulta.segredoDaConexao);
    } catch (erro) {
      // Cofre fora do ar e segredo ausente são respostas DIFERENTES (SPEC-54
      // §4): confundi-las faria a tela pedir para cadastrar o que já existe.
      throw new FalhaDoConector(
        `não deu para ler o segredo "${consulta.segredoDaConexao}" no cofre: ${erro instanceof Error ? erro.message : String(erro)}`
      );
    }
  }
  /**
   * **O cofre quando existe, o ambiente quando não** — o mesmo desenho de
   * `provedorDaOrganizacao` (cofre decorando a fonte de sempre).
   *
   * A invariante da D18 é *"nunca no DOCUMENTO"*, e ela continua de pé: o
   * documento guarda só a CHAVE. A variável de ambiente é onde uma
   * connection string mora num deploy em container — o próprio
   * `DATABASE_URL` do produto vem de lá. Sem esta ponte, o conector de banco
   * nasceria morto em toda instalação sem Infisical, que é a maioria.
   */
  if (!connectionString) connectionString = process.env[nomeDaVariavel(consulta.segredoDaConexao)] ?? null;

  if (!connectionString) {
    throw new FalhaDoConector(
      `não achei a conexão "${consulta.segredoDaConexao}": cadastre-a no cofre ou na variável de ambiente ${nomeDaVariavel(consulta.segredoDaConexao)}`
    );
  }

  // A tradução é PURA e lança nomeando o parâmetro que faltou (§9.3).
  const { texto, valores } = traduzirConsulta(comLimite(consulta.sql, consulta.limite), parametros);

  const cliente = await poolPara(consulta.segredoDaConexao, connectionString)
    .connect()
    .catch((erro: unknown) => {
      throw new FalhaDoConector(
        `não deu para conectar no banco de "${conector.id}": ${erro instanceof Error ? erro.message : String(erro)}`
      );
    });

  try {
    /**
     * A transação READ ONLY é a trava que vale — a régua de texto da
     * aplicação recusa o óbvio, esta recusa o resto. `statement_timeout` é
     * local à transação: não vaza para a próxima consulta do mesmo cliente.
     */
    await cliente.query("BEGIN TRANSACTION READ ONLY");
    await cliente.query(`SET LOCAL statement_timeout = ${TIMEOUT_DA_CONSULTA_MS}`);
    const resultado = await cliente.query(texto, valores as unknown[]);
    await cliente.query("COMMIT");

    /**
     * As linhas viram a SAÍDA DECLARADA pelo mesmo mapeador do HTTP (§263):
     * `caminho` continua sendo JSONPath sobre o corpo, e o corpo aqui é
     * `{ linhas, total }`. Sem isto haveria duas ideias de "como se lê a
     * resposta de um conector", e elas divergiriam.
     */
    return mapearSaidaDoConector(conector, { linhas: resultado.rows, total: resultado.rowCount ?? resultado.rows.length });
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    // A mensagem do Postgres, SEM stack: ela diz a coluna que não existe, que
    // é exatamente o que quem escreveu o SQL precisa ler no rastro.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    throw new FalhaDoConector(`a consulta de "${conector.id}" falhou: ${mensagem}`);
  } finally {
    cliente.release();
  }
}
