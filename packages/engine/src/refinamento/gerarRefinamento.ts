import type { RegrasConfig, Requisito, TesteAutomatizado } from "../config/types.js";

/**
 * Casamento parcial e sem case, igual ao legado: um requisito com
 * `contextos: ["Backend-mensagens"]` se aplica tanto a "Backend-mensagens rabbitmq"
 * quanto a "Backend-mensagens kafka" — deliberado, para não duplicar regra por tech de fila.
 */
function contextoBate(contextosDoItem: string[], contextosDaAtividade: string[]): boolean {
  if (contextosDoItem.length === 0) return true;
  return contextosDoItem.some((ctx) =>
    contextosDaAtividade.some(
      (sel) => sel.includes(ctx) || sel.toLowerCase().includes(ctx.toLowerCase())
    )
  );
}

function requisitosRelevantes(reqs: Requisito[], contextos: string[]): Requisito[] {
  return reqs.filter((r) => contextoBate(r.contextos, contextos));
}

function testesRelevantes(testes: TesteAutomatizado[], contextos: string[]): TesteAutomatizado[] {
  return testes.filter((t) => contextoBate(t.contextos, contextos));
}

/** Checklist de refinamento técnico em Markdown, filtrado por techs+contextos da atividade. */
export function gerarChecklistTecnico(regras: RegrasConfig, techs: string[], contextos: string[]): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = requisitosRelevantes(porTech.requisitos, contextos);
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    for (const r of relevantes) {
      linhas.push(r.tipo === "checklist" ? `- [ ] ${r.texto}` : `${r.texto} <- especificar`);
    }
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}

/** Ciclos de teste automatizados (DEV/HLG) em Markdown, filtrados por techs+contextos. */
export function gerarCiclosDeTeste(regras: RegrasConfig, techs: string[], contextos: string[]): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = testesRelevantes(porTech.testes, contextos);
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    const dev = relevantes.filter((t) => t.dev);
    const hlg = relevantes.filter((t) => t.hlg);
    if (dev.length > 0) {
      linhas.push("_DEV:_");
      for (const t of dev) linhas.push(`- **${t.tipo}**: ${t.validacao}`);
    }
    if (hlg.length > 0) {
      linhas.push("_HLG:_");
      for (const t of hlg) linhas.push(`- **${t.tipo}**: ${t.validacao}`);
    }
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}
