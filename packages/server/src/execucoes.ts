import { desc, sql } from "drizzle-orm";
import type { BancoDeDados } from "./db/client.js";
import { execucoesIa } from "./db/schema.js";

/**
 * SPEC-60 fatia B — o rastro da esteira.
 *
 * ## Por que o registro mora aqui e é chamado de UM lugar
 *
 * `executarPedido`, em `routes/ia.ts`, é o funil por onde passa **toda**
 * chamada ao modelo — e já recebe um `rotulo`. Registrar ali é registrar tudo
 * sem espalhar; registrar em cada rota seria garantir que a próxima rota
 * esqueça, e um rastro com buraco é pior que rastro nenhum, porque o buraco se
 * lê como "não rodou".
 *
 * ## Fire-and-forget, como a auditoria
 *
 * Gravar o rastro nunca pode derrubar a resposta de quem está esperando o
 * modelo. Falha ao registrar morre no `catch` — mesma disciplina de
 * `registrarAuditoria`, e pelo mesmo motivo: observabilidade que quebra o
 * caminho principal é um defeito que ela mesma criou.
 */
export interface DadosDaExecucao {
  rotulo: string;
  papel?: string | null;
  ok: boolean;
  erro?: string | null;
  duracaoMs: number;
  email?: string | null;
}

/** Quantas execuções o histórico guarda. Ninguém pergunta "como foi a execução
 * de três meses atrás" numa ferramenta de desenho, e rastro que cresce para
 * sempre vira problema de operação — que é justamente o tipo de dívida que esta
 * fatia não pode criar para acender um avatar. */
export const LIMITE_DE_HISTORICO = 200;

export function registrarExecucao(db: BancoDeDados, dados: DadosDaExecucao): void {
  void db
    .insert(execucoesIa)
    .values({
      rotulo: dados.rotulo,
      papel: dados.papel ?? null,
      ok: dados.ok,
      // A mensagem inteira, e não um código: quem abre o mapa para entender uma
      // falha precisa do que o gateway disse, não de um enum nosso.
      erro: dados.erro ?? null,
      duracaoMs: dados.duracaoMs,
      email: dados.email ?? null,
    })
    .then(() => podar(db))
    .catch(() => {
      // observabilidade, não bloqueia nem propaga — a chamada principal já
      // aconteceu, e o usuário já recebeu (ou não) o texto do modelo.
    });
}

/**
 * A poda, junto do insert.
 *
 * Uma varredura por execução parece caro e não é: a tabela nunca passa de
 * `LIMITE_DE_HISTORICO` + 1 linha, então o "scan" é sobre duzentas linhas. A
 * alternativa — um job periódico — cria uma peça de infraestrutura nova para
 * resolver um problema que cabe numa cláusula.
 */
async function podar(db: BancoDeDados): Promise<void> {
  await db
    .delete(execucoesIa)
    .where(
      sql`${execucoesIa.id} NOT IN (SELECT id FROM ${execucoesIa} ORDER BY ${execucoesIa.em} DESC LIMIT ${LIMITE_DE_HISTORICO})`
    );
}

export interface ExecucaoDePapel {
  papel: string;
  ok: boolean;
  em: string;
  duracaoMs: number;
  erro?: string;
}

/**
 * A ÚLTIMA execução de cada papel — que é exatamente o que o avatar precisa.
 *
 * Devolver o histórico inteiro e deixar a tela agrupar seria mandar duzentas
 * linhas pela rede para mostrar meia dúzia de bolinhas. E "a última" é uma
 * pergunta que o banco responde melhor do que qualquer laço em JavaScript.
 */
export async function ultimaExecucaoPorPapel(db: BancoDeDados): Promise<ExecucaoDePapel[]> {
  const linhas = await db
    .selectDistinctOn([execucoesIa.papel])
    .from(execucoesIa)
    .where(sql`${execucoesIa.papel} IS NOT NULL`)
    .orderBy(execucoesIa.papel, desc(execucoesIa.em));

  return linhas.map((l) => ({
    papel: l.papel!,
    ok: l.ok,
    em: l.em.toISOString(),
    duracaoMs: l.duracaoMs,
    ...(l.erro ? { erro: l.erro } : {}),
  }));
}
