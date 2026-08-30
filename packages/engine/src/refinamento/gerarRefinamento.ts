import type { Aresta, No, ValorSpec } from "../model/types.js";
import type { Condicao, ItemProcesso, RegrasConfig, Requisito, TesteAutomatizado } from "../config/types.js";
import { avaliarCondicao, type ContextoDaCondicao } from "../spec/condicoes.js";

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

/** Exportado desde a fatia B (§239): a conformidade precisa da MESMA régua de
 * casamento tech×contexto que o checklist usa. Duplicá-la faria as duas
 * divergirem — um requisito apareceria no documento e não seria conferido, ou
 * o contrário. */
export function requisitosRelevantes(reqs: Requisito[], contextos: string[]): Requisito[] {
  return reqs.filter((r) => contextoBate(r.contextos, contextos));
}

function testesRelevantes(testes: TesteAutomatizado[], contextos: string[]): TesteAutomatizado[] {
  return testes.filter((t) => contextoBate(t.contextos, contextos));
}

/** Marcador exigido pelo agente de IA que valida os itens (padrão documentado
 * em Confluence, ver SPEC-19) — toda linha de "Requisitos de refinamento"
 * termina assim, sem exceção. Nunca remover/alterar. */
export const MARCADOR_ESPECIFICAR = "<- ✍️ especificar";

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
 * pelo cálculo de prontidão). Exportada: `gerarEspecificacaoEntrega.ts`
 * reusa pra história de usuário/critérios de aceite contextuais (Fase 1d-ii,
 * SPEC-23), mesma regra, evita duplicar a checagem. */
export function respostaVisivel(resp: ValorSpec | undefined): resp is ValorSpec {
  return !!resp && (resp.origem === "manual" || resp.confirmado === true);
}

/** SPEC-41 §1 — a marca de sugestão não confirmada NO DOCUMENTO. */
export const MARCA_SUGERIDO = "_(sugerido pela esteira — confirmar)_";

/**
 * SPEC-74 fatia D — o que se grava na `evidencia` de um valor escrito pelo
 * MODO SEM CUSTO, onde nenhum modelo foi consultado.
 *
 * Na `evidencia` do próprio valor, e não num estado global de "o modo está
 * ligado": a proveniência tem que viajar COM o dado. Quem gerou no modo
 * simulado, trocou para um gateway de verdade e exportou uma semana depois
 * continua carregando um item cujo texto ninguém escreveu — e um sinalizador de
 * modo, lido no momento da exportação, diria que está tudo bem.
 */
export const EVIDENCIA_SIMULADA = "modo sem custo — resposta simulada";

/**
 * SPEC-74 fatia D — a marca de conteúdo simulado NO DOCUMENTO, irmã da
 * `MARCA_SUGERIDO` e pelo mesmo motivo: o §235 precisou de uma marca de
 * demonstração porque a primeira captura de tela vira "olha o que a IA
 * respondeu". Um item exportado com texto que nenhum modelo escreveu, sem
 * dizer isso, vira dado real no backlog de alguém.
 *
 * Marca, e NÃO impede (§5.1 da SPEC): bloquear a exportação seria decidir pela
 * pessoa, e é a mesma régua do §230.
 */
export const MARCA_SIMULADO = "_(simulado — modo sem custo)_";

/** As marcas que uma resposta carrega, na mesma ordem sempre. */
export function marcasDaResposta(r: { sugerida: boolean; simulada: boolean }): string {
  return [r.sugerida ? MARCA_SUGERIDO : "", r.simulada ? MARCA_SIMULADO : ""].filter(Boolean).join(" ");
}

/** A mesma coisa, no formato de bloco separado que o documento usa. */
export function blocoDeMarcas(r: { sugerida: boolean; simulada: boolean }): string {
  const marcas = marcasDaResposta(r);
  return marcas ? `\n\n${marcas}` : "";
}

/**
 * SPEC-41 §1 — o que o DOCUMENTO mostra (a prontidão continua com
 * `respostaVisivel`: confirmação humana é o que refina). Achado real: o
 * markdown saía com "(sem história definida)" e "✍️ especificar" ao lado de
 * conteúdo JÁ preenchido — sugestão da esteira era descartada do documento,
 * e o marcador era impresso incondicionalmente.
 */
export function respostaParaDocumento(
  resp: ValorSpec | undefined
): { texto: string; sugerida: boolean; simulada: boolean } | null {
  if (!resp || String(resp.valor ?? "").trim() === "") return null;
  return {
    texto: String(resp.valor),
    sugerida: !respostaVisivel(resp),
    // SPEC-74 — confirmar uma resposta simulada tira a marca de "sugerido" e
    // NÃO tira a de "simulado": quem confirmou assumiu o texto, mas o texto
    // continua não tendo vindo de modelo nenhum.
    simulada: resp.evidencia === EVIDENCIA_SIMULADA,
  };
}

/** Chaves fixas dos dois placeholders que toda atividade tem, independente
 * de tech/regras.json (Fase 1d-ii, SPEC-23) — achado real: o usuário queria
 * que a IA escrevesse a história do item e cenários de teste contextuais, não
 * só respondesse checklist técnico. Prefixo `_` pra nunca colidir com uma
 * chave `${tech}::...`. */
export const CHAVE_HISTORIA_USUARIO = "_historiaUsuario";
export const CHAVE_CRITERIOS_ACEITE = "_criteriosAceite";

/** Chaves fixas dos placeholders da esteira de agentes (SPEC-24) — contrato de
 * arquitetura (papel Arquiteto: nó vinculado/request/response/erros/
 * dependências) e regras de teste + cenário Gherkin (papel QA). Mesma
 * disciplina de `CHAVE_HISTORIA_USUARIO`/`CHAVE_CRITERIOS_ACEITE`: cada
 * sub-campo é seu próprio `ValorSpec` escalar, sempre presente — decisão
 * fechada em SPEC-24 §4.2 depois de descartar guardar um objeto serializado
 * (quebraria toda suposição de `valor: string` já espalhada pela UI). */
export const CHAVE_CONTRATO_NO_VINCULADO = "_contratoNoVinculado";
export const CHAVE_CONTRATO_REQUEST = "_contratoRequest";
export const CHAVE_CONTRATO_RESPONSE = "_contratoResponse";
export const CHAVE_CONTRATO_ERROS = "_contratoErros";
export const CHAVE_CONTRATO_DEPENDENCIAS = "_contratoDependencias";
export const CHAVE_REGRAS_TESTE = "_regrasTeste";
export const CHAVE_CENARIO_FEATURE = "_cenarioFeature";
/** SPEC-47 — o que fica PRONTO quando o item termina. O documento descrevia
 * o trabalho e parava aí; quem pega o item precisa saber o entregável, e é a
 * pergunta que o PO responde melhor (foi o pedido: "o template precisa ter a
 * entrega final no fim de cada item"). */
export const CHAVE_ENTREGA_FINAL = "_entregaFinal";

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
  respostas?: Record<string, ValorSpec>,
  /** SPEC-87 (P5) — o regime da demanda, para as réguas condicionadas por modo. */
  contexto: ContextoDaCondicao = {}
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
      condicaoBate(r, nos, arestas, contexto)
    );
    if (relevantes.length === 0) continue;

    const linhas = [`**${tech.toUpperCase()}:**`];
    for (const r of relevantes) {
      const resp = respostaParaDocumento(respostas?.[chaveChecklistTecnico(tech, r.texto)]);
      // O marcador só em campo VAZIO; resposta sugerida entra com a marca.
      if (resp) linhas.push(`- ${r.texto}: ${resp.texto}${marcasDaResposta(resp) ? ` ${marcasDaResposta(resp)}` : ""}`);
      else linhas.push(`- ${r.texto} ${MARCADOR_ESPECIFICAR}`);
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
  arestas: Aresta[],
  /** SPEC-87 (P5) — o regime da demanda. */
  contexto: ContextoDaCondicao = {}
): string {
  const blocos: string[] = [];
  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech?.checklistProcesso) continue;
    const relevantes = porTech.checklistProcesso.filter(
      (item) => contextoBate(item.contextos, contextos) && condicaoBate(item, nos, arestas, contexto)
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
/** Idem — o `when` de um requisito vale para conferir tanto quanto para listar. */
export function condicaoBate(
  item: { when?: Condicao },
  nos: No[],
  arestas: Aresta[],
  /** SPEC-87 — o regime da demanda, para o `when` poder olhá-lo. */
  contexto: ContextoDaCondicao = {}
): boolean {
  if (!item.when) return true;
  /**
   * SPEC-87 — **o nó de mentira foi tentado aqui, e o teste o derrubou.**
   *
   * A ideia era: uma condição de modo não olha o nó, então com o desenho vazio
   * ela deveria poder valer. Escrevi um `NO_VAZIO` para isso — e ele nascia com
   * `status: "novo"`, que é um status REAL. Toda régua condicionada por
   * `nodeStatus: "novo"` passou a bater contra um nó que não existe, e o
   * `exportar.test.ts` acusou na hora.
   *
   * Não era só o status: qualquer valor que eu escolhesse seria um valor que
   * alguma régua pode perguntar. E o caso nem existe — `nos` são os nós de
   * ORIGEM de uma atividade, e atividade sem nó não é derivada. Era risco puro
   * por um caso que o produto não produz.
   */
  return nos.some((no) => avaliarCondicao(item.when!, no, arestas, contexto));
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
    const resp = respostaParaDocumento(respostas?.[chaveVolumetria(tech, campo)]);
    if (resp) return `- ${campo}: ${resp.texto}${marcasDaResposta(resp) ? ` ${marcasDaResposta(resp)}` : ""}`;
    return `- ${campo}: ___ ${MARCADOR_ESPECIFICAR}`;
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
  secao:
    | "historiaUsuario"
    | "criteriosAceite"
    | "contrato"
    | "checklistTecnico"
    | "volumetria"
    | "regrasTeste"
    | "cenarioFeature"
    | "entregaFinal";
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
  arestas: Aresta[],
  /** SPEC-87 (P5) — o regime da demanda. Os placeholders têm que ser os MESMOS
   * que o checklist mostra: uma régua condicionada por modo que não aparecesse
   * aqui viraria pergunta sem lugar para a resposta. */
  contexto: ContextoDaCondicao = {}
): PlaceholderRefinamento[] {
  // Toda atividade precisa de história + critérios de aceite, independente
  // de ter regra técnica configurada pra sua tech (Fase 1d-ii, SPEC-23) — o
  // pedido original era a IA escrever isso pra cada item, não só responder
  // checklist. `tech: ""` porque não tem uma tech específica associada.
  const placeholders: PlaceholderRefinamento[] = [
    { chave: CHAVE_HISTORIA_USUARIO, tech: "", secao: "historiaUsuario", rotulo: "História de usuário" },
    { chave: CHAVE_CRITERIOS_ACEITE, tech: "", secao: "criteriosAceite", rotulo: "Critérios de aceite (cenários contextuais)" },
    { chave: CHAVE_CONTRATO_NO_VINCULADO, tech: "", secao: "contrato", rotulo: "Nó vinculado" },
    { chave: CHAVE_CONTRATO_REQUEST, tech: "", secao: "contrato", rotulo: "Request" },
    { chave: CHAVE_CONTRATO_RESPONSE, tech: "", secao: "contrato", rotulo: "Response" },
    { chave: CHAVE_CONTRATO_ERROS, tech: "", secao: "contrato", rotulo: "Erros" },
    { chave: CHAVE_CONTRATO_DEPENDENCIAS, tech: "", secao: "contrato", rotulo: "Dependências" },
    { chave: CHAVE_REGRAS_TESTE, tech: "", secao: "regrasTeste", rotulo: "Regras de teste" },
    { chave: CHAVE_CENARIO_FEATURE, tech: "", secao: "cenarioFeature", rotulo: "Cenário Gherkin" },
    { chave: CHAVE_ENTREGA_FINAL, tech: "", secao: "entregaFinal", rotulo: "Entrega final (o que fica pronto)" },
  ];

  for (const tech of techs) {
    const porTech = regras.porTech[tech];
    if (!porTech) continue;
    const relevantes = requisitosRelevantes(porTech.checklistTecnico ?? [], contextos).filter((r) =>
      condicaoBate(r, nos, arestas, contexto)
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
