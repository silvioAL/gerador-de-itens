import type { Aresta, No, ValorSpec } from "../model/types.js";
import type { Condicao, ItemProcesso, RegrasConfig, Requisito, TesteAutomatizado } from "../config/types.js";
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

/** Chave de um placeholder de checklist técnico — namespaced por tech pra
 * nunca colidir entre techs da mesma atividade (Fase 1, SPEC-23). */
function chaveChecklistTecnico(tech: string, texto: string): string {
  return `${tech}::${texto}`;
}

/** Chave de um placeholder de volumetria — mesmo raciocínio, mais o campo. */
function chaveVolumetria(tech: string, campo: string): string {
  return `${tech}::volumetria::${campo}`;
}

/** Só entra no documento se veio de resposta humana OU de sugestão já
 * confirmada — sugestão não confirmada fica só no painel interativo, nunca
 * no texto final (mesma disciplina "nada sugerido conta até confirmado" de
 * `calcularProntidao`, aplicada por convenção aqui — este texto não passa
 * pelo cálculo de prontidão). */
function respostaVisivel(resp: ValorSpec | undefined): resp is ValorSpec {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/**
 * Checklist de refinamento técnico em Markdown, filtrado por techs+contextos
 * da atividade e por `when` (ver `condicaoBate`) — ex.: "definir plano de
 * migração do schema" só faz sentido se o recurso já existir, não pra um
 * criado do zero. Achado real: antes desse filtro, os mesmos itens apareciam
 * pra um Mongo novo e pra um já existente, sem diferença nenhuma.
 */
export function gerarChecklistTecnico(
  regras: RegrasConfig,
  techs: string[],
  contextos: string[],
  nos: No[],
  arestas: Aresta[],
  respostas?: Record<string, ValorSpec>
): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    // `regras.json` é editado à mão, sem UI nem validação no caminho do app web
    // (só packages/cli valida via validateRegras) — achado real: um tech sem
    // checklistTecnico preenchido derrubava a tela de revisão inteira num
    // TypeError não tratado (nenhum ErrorBoundary existia pra conter isso).
    // `?? []` trata "faltando" como "nenhum item técnico pra essa tech", nunca
    // como erro fatal de renderização.
    const relevantes = requisitosRelevantes(porTech.checklistTecnico ?? [], contextos).filter((r) =>
      condicaoBate(r, nos, arestas)
    );
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    for (const r of relevantes) {
      const resp = respostas?.[chaveChecklistTecnico(tech, r.texto)];
      const sufixo = respostaVisivel(resp) ? `: ${String(resp.valor)}` : "";
      linhas.push(`- ${r.texto}${sufixo} ${MARCADOR_ESPECIFICAR}`);
    }
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
 * como verdadeira, mesma disciplina de "nunca verde sem alguém olhar".
 * Compartilhado entre checklist técnico (`Requisito`) e de processo
 * (`ItemProcesso`) — os dois só diferem no `texto`/`contextos`, a regra de
 * avaliação do `when` é idêntica. */
function condicaoBate(item: { when?: Condicao }, nos: No[], arestas: Aresta[]): boolean {
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
export function gerarVolumetria(
  regras: RegrasConfig,
  techs: string[],
  contextos: string[],
  respostas?: Record<string, ValorSpec>
): string {
  const techsAplicaveis = techs.filter((tech) => {
    const volumetria = regras.porTech[tech]?.volumetria;
    return volumetria ? contextoBate(volumetria.contextos, contextos) : false;
  });
  if (techsAplicaveis.length === 0) return "";
  // Achado real ao adicionar respostas: sem tech pra namespacear a chave, o
  // bloco de volumetria seria ambíguo se duas techs da mesma atividade
  // exigirem volumetria — usa a primeira tech aplicável, mesma convenção
  // de "um bloco só, não um por tech" que o bloco de volumetria já tinha.
  const tech = techsAplicaveis[0];
  return CAMPOS_VOLUMETRIA.map((campo) => {
    const resp = respostas?.[chaveVolumetria(tech, campo)];
    const valor = respostaVisivel(resp) ? String(resp.valor) : "___";
    return `- ${campo}: ${valor} ${MARCADOR_ESPECIFICAR}`;
  }).join("\n");
}

/** Ciclos de teste automatizados (DEV/HLG) em Markdown, filtrados por techs+contextos. */
export function gerarCiclosDeTeste(regras: RegrasConfig, techs: string[], contextos: string[]): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = testesRelevantes(porTech.testes ?? [], contextos);
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

/** Um placeholder "<- ✍️ especificar" (checklist técnico ou volumetria)
 * ainda sem resposta pra essa atividade — o que a UI mostra num painel de
 * "sugerir com IA" e o que `gerarChecklistTecnico`/`gerarVolumetria` sabem
 * interpolar de volta via a mesma `chave` (Fase 1, SPEC-23). */
export interface PlaceholderRefinamento {
  chave: string;
  tech: string;
  secao: "checklistTecnico" | "volumetria";
  rotulo: string;
}

/**
 * Enumera os placeholders aplicáveis a uma atividade — mesma filtragem
 * (tech/contexto/`when`) que `gerarChecklistTecnico`/`gerarVolumetria` já
 * usam pra decidir o que renderizar, extraída aqui pra não duplicar a lógica
 * de "esse item se aplica a essa atividade" entre o texto final e o painel
 * interativo que oferece a sugestão.
 */
export function listarPlaceholders(
  regras: RegrasConfig,
  techs: string[],
  contextos: string[],
  nos: No[],
  arestas: Aresta[]
): PlaceholderRefinamento[] {
  const placeholders: PlaceholderRefinamento[] = [];

  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = requisitosRelevantes(porTech.checklistTecnico ?? [], contextos).filter((r) =>
      condicaoBate(r, nos, arestas)
    );
    for (const r of relevantes) {
      placeholders.push({ chave: chaveChecklistTecnico(tech, r.texto), tech, secao: "checklistTecnico", rotulo: r.texto });
    }
  }

  const techVolumetria = techs.find((tech) => {
    const volumetria = regras.porTech[tech]?.volumetria;
    return volumetria ? contextoBate(volumetria.contextos, contextos) : false;
  });
  if (techVolumetria) {
    for (const campo of CAMPOS_VOLUMETRIA) {
      placeholders.push({ chave: chaveVolumetria(techVolumetria, campo), tech: techVolumetria, secao: "volumetria", rotulo: campo });
    }
  }

  return placeholders;
}
