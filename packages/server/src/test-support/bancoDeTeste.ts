import { Client } from "pg";
import type { BancoDeDados } from "../db/client.js";
import { organizacoes } from "../db/schema.js";

/**
 * ACHADO REAL, rodando o modo hospedado: a suíte do server tinha
 * `DATABASE_URL ?? "…/gerador"` como padrão — o MESMO banco do docker-compose de
 * desenvolvimento. Cada `npm test` truncava as tabelas do ambiente de uso e o
 * último teste deixava para trás o que tinha criado. O estrago concreto: um
 * papel "Administrador" sobreviveu ao fim da suíte, e papel existindo LIGA o
 * RBAC da organização (SPEC-28 §4.3) — o banco de trabalho ficou com controle
 * de acesso ativo, um único papel podendo só `acessos:editar`, e a massa de
 * demonstração apagada. Ninguém percebeu porque a suíte ficou verde o tempo
 * todo: o dano é no ambiente ao lado, não no teste.
 *
 * Duas defesas, nesta ordem:
 *
 * 1. Banco próprio (`gerador_test`), criado sob demanda — separação de verdade,
 *    não convenção.
 * 2. Uma trava que recusa rodar contra um banco cujo nome não termine em
 *    `_test`. É ela que importa: o padrão pode ser corrigido de novo por
 *    engano, mas a trava faz a suíte parar com uma mensagem em vez de truncar
 *    o banco de alguém.
 */

/** O padrão da suíte: nunca o banco de desenvolvimento. */
export const URL_BANCO_DE_TESTE = "postgres://gerador:gerador@localhost:5432/gerador_test";

const SUFIXO_EXIGIDO = "_test";

/** `postgres://u:s@host:5432/nome` → `nome` (sem query string). */
export function nomeDoBanco(url: string): string {
  return new URL(url).pathname.replace(/^\//, "").split("?")[0];
}

/**
 * Recusa qualquer banco que não pareça descartável. `PERMITIR_BANCO_NAO_TESTE`
 * existe como escape para quem sabe o que está fazendo (um Postgres efêmero de
 * CI com outro nome, por exemplo) — a decisão fica explícita, não implícita.
 */
export function exigirBancoDescartavel(url: string): void {
  const nome = nomeDoBanco(url);
  if (nome.endsWith(SUFIXO_EXIGIDO) || process.env.PERMITIR_BANCO_NAO_TESTE === "1") return;
  throw new Error(
    `A suíte trunca tabelas e o banco "${nome}" não termina em "${SUFIXO_EXIGIDO}" — recusando rodar ` +
      `pra não apagar dados de um ambiente em uso. Use ${URL_BANCO_DE_TESTE} ou, se o banco for mesmo ` +
      `descartável, rode com PERMITIR_BANCO_NAO_TESTE=1.`
  );
}

/**
 * Cria o banco se ele ainda não existir, conectando no `postgres` do mesmo
 * servidor. Sem isso, separar o banco viraria um passo manual de setup — e um
 * passo manual de setup é um passo que alguém pula, voltando ao banco de dev.
 */
export async function garantirBancoDeTeste(url: string): Promise<void> {
  const alvo = nomeDoBanco(url);
  const manutencao = new URL(url);
  manutencao.pathname = "/postgres";

  const cliente = new Client({ connectionString: manutencao.toString() });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query("select 1 from pg_database where datname = $1", [alvo]);
    // Nome de banco não é parametrizável em CREATE DATABASE; `alvo` vem da
    // própria DATABASE_URL e passa por aspas duplas.
    if (!rowCount) await cliente.query(`create database "${alvo.replace(/"/g, '""')}"`);
  } finally {
    await cliente.end();
  }
}

/**
 * A organização que os testes usam: a que existir, ou uma nova se o banco
 * estiver vazio.
 *
 * Existe porque `organizacoes` NÃO tem restrição única em `nome`, então
 * `insert(...).onConflictDoNothing()` sempre insere. Dois arquivos de teste
 * fazendo isso deixavam a tabela com várias linhas, e qualquer teste que
 * lesse "a primeira organização" passava a depender da ordem do Postgres —
 * o que apareceu como uma falha isolada e não reproduzível.
 */
export async function organizacaoDeTeste(db: BancoDeDados): Promise<string> {
  const [existente] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
  if (existente) return existente.id;

  const [criada] = await db.insert(organizacoes).values({ nome: "Organização de teste" }).returning();
  return criada.id;
}
