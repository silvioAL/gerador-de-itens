import type { Aresta, No } from "../model/types.js";
import type { ItemProcesso, RegrasConfig, Requisito, TesteAutomatizado } from "../config/types.js";
import { avaliarCondicao } from "../spec/condicoes.js";

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

/** Marcador exigido pelo agente de IA que valida os itens (padrão documentado
 * em Confluence, ver SPEC-19) — toda linha de "Requisitos de refinamento"
 * termina assim, sem exceção. Nunca remover/alterar. */
const MARCADOR_ESPECIFICAR = "<- ✍️ especificar";

/** Checklist de refinamento técnico em Markdown, filtrado por techs+contextos da atividade. */
export function gerarChecklistTecnico(regras: RegrasConfig, techs: string[], contextos: string[]): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = requisitosRelevantes(porTech.checklistTecnico, contextos);
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    for (const r of relevantes) linhas.push(`- ${r.texto} ${MARCADOR_ESPECIFICAR}`);
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}

/**
 * Checklist de **processo** — o que o time precisa fazer pra executar/testar,
 * separado do técnico (que é o que precisa ser decidido no desenho). Além de
 * tech+contexto, cada item pode ter um `when` avaliado contra os **nós de
 * origem** da atividade: satisfaz se **algum** deles bater, mesma régua de
 * `.some()` do casamento de contexto — numa atividade de aresta há dois nós
 * (quem chama e o que é usado), e exigir os dois perderia caso legítimo.
 *
 * Formato `- [ ]`, não o `<- ✍️ especificar` do técnico: são coisas a marcar
 * como feitas, e o padrão do agente validador reserva o marcador pra seção
 * "Requisitos de refinamento" — que, pelo próprio padrão, não deve conter
 * atividade de teste (ver SPEC-20).
 */
export function gerarChecklistProcesso(
  regras: RegrasConfig,
  techs: string[],
  contextos: string[],
  nos: No[],
  arestas: Aresta[]
): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech?.checklistProcesso) continue;
    const relevantes = porTech.checklistProcesso.filter(
      (item) => contextoBate(item.contextos, contextos) && condicaoBate(item, nos, arestas)
    );
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    for (const item of relevantes) linhas.push(`- [ ] ${item.texto}`);
    blocos.push(linhas.join("\n"));
  }
  return blocos.join("\n\n");
}

/** Sem `when`, o item vale sempre. Sem nó de origem (atividade solta), um item
 * condicionado não aparece — condição que não dá pra avaliar não é assumida
 * como verdadeira, mesma disciplina de "nunca verde sem alguém olhar". */
function condicaoBate(item: ItemProcesso, nos: No[], arestas: Aresta[]): boolean {
  if (!item.when) return true;
  return nos.some((no) => avaliarCondicao(item.when!, no, arestas));
}

/** Campos fixos do bloco de volumetria — nome e ordem exigidos pelo agente de
 * validação, nunca preenchidos automaticamente (sempre `___`, pra completar
 * na mão). */
const CAMPOS_VOLUMETRIA = ["Response time", "Max error", "RPS (Requisições por segundo)", "Test duration"];

/** Bloco "Requisitos de volumetria" quando alguma tech relevante o exige pro
 * conjunto de contextos da atividade — formato fixo, nunca gerado por
 * dedução (ver `RegrasPorTech.volumetria`). */
export function gerarVolumetria(regras: RegrasConfig, techs: string[], contextos: string[]): string {
  const aplica = techs.some((tech) => {
    const volumetria = regras.porTech[tech]?.volumetria;
    return volumetria ? contextoBate(volumetria.contextos, contextos) : false;
  });
  if (!aplica) return "";
  return CAMPOS_VOLUMETRIA.map((campo) => `- ${campo}: ___ ${MARCADOR_ESPECIFICAR}`).join("\n");
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
