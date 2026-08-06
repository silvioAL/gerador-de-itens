import type { Atividade, Ciclo, Conflito } from "../model/types.js";
import type { RegrasConfig } from "../config/types.js";
import { gerarChecklistTecnico, gerarCiclosDeTeste } from "../refinamento/gerarRefinamento.js";

function descreverDependencia(a: Atividade): string {
  return a.dependencias
    .map((d) => (d.alvoChave ? `${d.type}→${d.alvoChave}` : d.type))
    .join("; ");
}

function descreverSpecResumo(a: Atividade): string {
  if (!a.specResumo) return "";
  return Object.entries(a.specResumo)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(", ");
}

/**
 * Backlog derivado em Markdown — o artefato que uma skill de planejamento consome depois.
 * Quando `regras` é passado, cada atividade ganha seu checklist de refinamento
 * técnico e ciclos de teste (DEV/HLG), filtrados pelos techs/contextos dela —
 * o mesmo "preview do prompt" que o protótipo HTML gerava por história.
 */
export function paraMarkdown(
  atividades: Atividade[],
  ciclos: Ciclo[],
  conflitos: Conflito[],
  regras?: RegrasConfig
): string {
  const linhas: string[] = ["# Backlog derivado", ""];
  linhas.push("| # | Tipo | Tamanho | Descrição | Techs | Contextos | Dependências | Detalhes |");
  linhas.push("|---|---|---|---|---|---|---|---|");
  for (const a of atividades) {
    linhas.push(
      `| ${a.rotulo} | ${a.tipo} | ${a.tamanho} | ${a.descricao.replace(/\|/g, "\\|")} | ${a.techs.join(", ")} | ${a.contextos.join(", ")} | ${descreverDependencia(a)} | ${descreverSpecResumo(a)} |`
    );
  }

  // Seção própria em vez de coluna esparsa na tabela — só aparece quando há
  // alguma atividade que esbarra num sistema existente de outro time (achado
  // do usuário: uma coluna vazia na maioria das linhas lê como dado quebrado,
  // não como sinal intencional).
  const atividadesComOutroTime = atividades.filter((a) => (a.timesEnvolvidos ?? []).length > 0);
  if (atividadesComOutroTime.length > 0) {
    linhas.push("", "## Atenção: toca sistemas de outros times");
    for (const a of atividadesComOutroTime) {
      linhas.push(`- **${a.rotulo}** (${a.descricao}) — ${a.timesEnvolvidos!.join(", ")}`);
    }
  }

  if (ciclos.length > 0) {
    linhas.push("", "## Ciclos detectados");
    for (const c of ciclos) linhas.push(`- ${c.caminho.join(" → ")}`);
  }
  if (conflitos.length > 0) {
    linhas.push("", "## Conflitos detectados");
    for (const c of conflitos) {
      linhas.push(`- **${c.codigo}**: ${c.atividades.join(", ")}${c.alvo ? ` (alvo: ${c.alvo})` : ""}`);
    }
  }

  if (regras) {
    for (const a of atividades) {
      const checklist = gerarChecklistTecnico(regras, a.techs, a.contextos);
      const ciclosTeste = gerarCiclosDeTeste(regras, a.techs, a.contextos);
      if (!checklist && !ciclosTeste) continue;
      linhas.push("", `## Refinamento técnico — ${a.rotulo} ${a.descricao}`);
      if (checklist) linhas.push("", checklist);
      if (ciclosTeste) linhas.push("", "### Ciclos de teste", "", ciclosTeste);
    }
  }

  return linhas.join("\n") + "\n";
}

function csvEscape(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function paraCsv(atividades: Atividade[]): string {
  const cabecalho = ["rotulo", "tipo", "tamanho", "descricao", "techs", "contextos", "dependencias", "times", "detalhes"];
  const linhas = [cabecalho.join(",")];
  for (const a of atividades) {
    linhas.push(
      [
        a.rotulo,
        a.tipo,
        a.tamanho,
        a.descricao,
        a.techs.join("; "),
        a.contextos.join("; "),
        descreverDependencia(a),
        (a.timesEnvolvidos ?? []).join("; "),
        descreverSpecResumo(a),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return linhas.join("\n") + "\n";
}
