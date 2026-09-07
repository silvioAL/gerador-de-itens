import type { CampoDoConector } from "./conectores.js";
import { ConfigInvalida } from "./normalizacao.js";

/**
 * SPEC-110 fatia B — **a TELA como nó: onde a pessoa entra no fluxo.**
 *
 * O desenho é do usuário, à letra: *"acho que esse tipo de coisa poderia ser
 * abstraído como screen… seria feita a conexão com essa screen, o agente iria
 * gerar o ensaio, e depois o usuário revisa, e decide avançar para a derivação
 * (conexão com próximo output), ou retornar"*.
 *
 * Uma tela é capacidade com contrato, como a função e o conector — trocando o
 * executor por GENTE: `entrada` é o que ela mostra, `saida` é a DECISÃO
 * (`avancar` | `retornar`) mais o que a pessoa preencheu ou aprovou.
 *
 * ## Por que ela não "roda"
 *
 * Quando a execução chega numa tela ela SUSPENDE (a mecânica da SPEC-107 C,
 * §5.5, que já sabia esperar gente e sobreviver a F5) — a diferença é que o
 * gate pausa DEPOIS de um nó que já rodou, e a tela pausa NELA: o nó só
 * termina quando alguém decide. Avançar continua o fluxo com a saída dela;
 * Retornar encerra a execução (D2: re-rodar o nó anterior automaticamente é
 * dívida declarada, não v1).
 *
 * ## O registro é fechado (§242)
 *
 * As três telas do SISTEMA são as que já existem como tela de verdade no
 * produto — a bancada, o documento e a mesa. Tela do usuário (blocos
 * declarados) é a fatia C, e entra no MESMO vocabulário: quem consome uma
 * tela não pergunta de onde ela veio.
 */

export interface TelaDoSistema {
  id: "bancada-de-ensaios" | "documento" | "mesa";
  /** O rótulo nomeia a TELA como a pessoa a conhece (§2.3). */
  nome: string;
  /** O mesmo nome em duas palavras, para o cartão do canvas — a frase inteira
   * estica o cartão e esconde o vizinho (lição da fatia A). */
  rotuloCurto: string;
  descricao: string;
  /** O que a tela MOSTRA (vem pelas arestas). */
  entrada: CampoDoConector[];
  /** A decisão + o que a pessoa aprovou/preencheu. */
  saida: CampoDoConector[];
}

/**
 * D2 — **toda tela emite a decisão**, seja do sistema ou declarada: é o que
 * torna "avançar para a derivação, ou retornar" fiável no desenho. Fica aqui,
 * num lugar só, porque duas listas divergiriam na primeira tela nova.
 */
export const CAMPO_DA_DECISAO: CampoDoConector = {
  chave: "decisao",
  rotulo: "Decisão de quem revisou (avancar | retornar)",
  tipo: "texto",
};

export const TELAS_DO_SISTEMA: TelaDoSistema[] = [
  {
    id: "bancada-de-ensaios",
    nome: "Bancada de ensaios (revisar e decidir)",
    rotuloCurto: "Bancada de ensaios",
    descricao:
      "Mostra a leitura do ensaio e a mesa de cenários. Quem revisa pode re-medir, e então avançar (o fluxo segue com o ensaio aprovado) ou retornar.",
    entrada: [
      { chave: "ensaio", rotulo: "Leitura do ensaio", tipo: "objeto" },
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto" },
    ],
    saida: [CAMPO_DA_DECISAO, { chave: "ensaioAprovado", rotulo: "Ensaio aprovado", tipo: "objeto" }],
  },
  {
    id: "documento",
    nome: "Documento (revisar as sugestões)",
    rotuloCurto: "Documento",
    descricao:
      "Abre o documento da demanda para revisar o que a esteira sugeriu. O julgamento continua sendo o da demanda (§5.5) — a tela é a porta, não um segundo motor.",
    entrada: [
      { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
      { chave: "documento", rotulo: "Documento (markdown)", tipo: "documento" },
    ],
    saida: [CAMPO_DA_DECISAO],
  },
  {
    id: "mesa",
    nome: "Mesa de projeto (abrir e desenhar)",
    rotuloCurto: "Mesa de projeto",
    descricao:
      "Abre a mesa da demanda para desenhar ou conferir. É a PORTA para a mesa — quem quer o DADO da demanda usa os componentes de dados, não esta tela.",
    entrada: [{ chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" }],
    saida: [CAMPO_DA_DECISAO],
  },
];

export function telaDoSistema(id: string): TelaDoSistema | undefined {
  return TELAS_DO_SISTEMA.find((t) => t.id === id);
}

/**
 * SPEC-110 fatia C (D5) — **criar e editar telas é do usuário.**
 *
 * A tela declarada é uma pilha de BLOCOS. O conjunto é pequeno de propósito
 * (§2.4-10: o que existe, existe inteiro): `texto` explica, `dado` mostra o
 * que chegou pela fiação, `campo` pergunta, `acao` decide. Layout livre não
 * entra no v1 — os blocos são o chão, não o teto (a direção de app builder é
 * a SPEC-111, por degraus medidos).
 *
 * O contrato da tela NASCE dos blocos, não de uma declaração paralela:
 * `entrada` são os blocos `dado`, `saida` são os `campo` mais a decisão. Duas
 * fontes divergiriam no primeiro bloco editado.
 */
export const FORMATOS_DO_DADO = ["texto", "documento", "lista", "objeto"] as const;
export type FormatoDoDado = (typeof FORMATOS_DO_DADO)[number];

export const ENTRADAS_DO_CAMPO = ["texto", "numero", "escolha"] as const;
export type EntradaDoCampo = (typeof ENTRADAS_DO_CAMPO)[number];

export type BlocoDaTela =
  | { tipo: "texto"; markdown: string }
  | { tipo: "dado"; chave: string; rotulo: string; formato: FormatoDoDado }
  | { tipo: "campo"; chave: string; rotulo: string; entrada: EntradaDoCampo; opcoes?: string[]; obrigatorio?: boolean }
  /**
   * D17a — **o acionador NA tela, enlatado.** Rótulo editável, comportamento
   * FIXO do catálogo. "Ir para a próxima tela" NÃO é componente: avançar segue
   * a aresta, e se o próximo nó é outra tela, ela abre — a navegação entre
   * telas É a fiação.
   */
  | { tipo: "acao"; rotulo: string; acao: DecisaoDaTela };

export interface TelaDeclarada {
  id: string;
  nome: string;
  /** SPEC-110 H — o rosto da tela na galeria (emoji: zero asset, legível nos
   * dois temas). Ausente é legítimo; a galeria põe um padrão. */
  icone?: string;
  blocos: BlocoDaTela[];
}

export interface ConfigTelas {
  telas: TelaDeclarada[];
}

function sanearOpcoes(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean);
}

/** Um bloco só sobrevive à leitura se conseguir ser DESENHADO: sem chave não
 * há o que mostrar nem onde guardar, e um tipo desconhecido não tem
 * renderizador. Os três descartes são o mesmo — o que sobra não aparece. */
function sanearBloco(bruto: unknown): BlocoDaTela | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (b.tipo) {
    case "texto": {
      const markdown = typeof b.markdown === "string" ? b.markdown : "";
      return markdown.trim() ? { tipo: "texto", markdown } : null;
    }
    case "dado": {
      const chave = texto(b.chave);
      if (!chave) return null;
      const formato = (FORMATOS_DO_DADO as readonly string[]).includes(b.formato as string)
        ? (b.formato as FormatoDoDado)
        : "texto";
      return { tipo: "dado", chave, rotulo: texto(b.rotulo) || chave, formato };
    }
    case "campo": {
      const chave = texto(b.chave);
      if (!chave) return null;
      const entrada = (ENTRADAS_DO_CAMPO as readonly string[]).includes(b.entrada as string)
        ? (b.entrada as EntradaDoCampo)
        : "texto";
      const opcoes = sanearOpcoes(b.opcoes);
      return {
        tipo: "campo",
        chave,
        rotulo: texto(b.rotulo) || chave,
        entrada,
        ...(opcoes.length > 0 ? { opcoes } : {}),
        ...(b.obrigatorio === true ? { obrigatorio: true as const } : {}),
      };
    }
    case "acao": {
      if (!(DECISOES_DA_TELA as readonly unknown[]).includes(b.acao)) return null;
      const acao = b.acao as DecisaoDaTela;
      return { tipo: "acao", rotulo: texto(b.rotulo) || (acao === "avancar" ? "Avançar →" : "← Retornar"), acao };
    }
    default:
      return null;
  }
}

/** SPEC-35 — a leitura TOLERA: o que não dá para desenhar sai, e o resto da
 * tela continua de pé. Quem recusa é a escrita. */
export function normalizarTelas(documento: unknown): ConfigTelas {
  const bruto = (documento ?? {}) as Partial<ConfigTelas>;
  const telas: TelaDeclarada[] = [];
  const vistos = new Set<string>();
  for (const cru of Array.isArray(bruto.telas) ? bruto.telas : []) {
    if (!cru || typeof cru !== "object") continue;
    const id = typeof cru.id === "string" ? cru.id.trim() : "";
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const blocos: BlocoDaTela[] = [];
    const chavesVistas = new Set<string>();
    for (const blocoCru of Array.isArray(cru.blocos) ? cru.blocos : []) {
      const bloco = sanearBloco(blocoCru);
      if (!bloco) continue;
      // Chave repetida entre `dado`/`campo` faria dois blocos disputarem o
      // mesmo lugar no contrato — o segundo sai, como o nó de id repetido.
      if (bloco.tipo === "dado" || bloco.tipo === "campo") {
        if (chavesVistas.has(bloco.chave)) continue;
        chavesVistas.add(bloco.chave);
      }
      blocos.push(bloco);
    }
    telas.push({
      id,
      nome: typeof cru.nome === "string" && cru.nome.trim() ? cru.nome.trim() : id,
      ...(typeof cru.icone === "string" && cru.icone.trim() ? { icone: cru.icone.trim() } : {}),
      blocos,
    });
  }
  return { telas };
}

/** O contrato DERIVADO dos blocos: entrada = os `dado`, saída = os `campo`
 * mais a decisão (que toda tela emite, D2). */
export function contratoDaTelaDeclarada(tela: TelaDeclarada): { entrada: CampoDoConector[]; saida: CampoDoConector[] } {
  return {
    entrada: tela.blocos
      .filter((b): b is Extract<BlocoDaTela, { tipo: "dado" }> => b.tipo === "dado")
      .map((b) => ({ chave: b.chave, rotulo: b.rotulo, tipo: b.formato === "documento" ? "documento" : b.formato })),
    saida: [
      CAMPO_DA_DECISAO,
      ...tela.blocos
        .filter((b): b is Extract<BlocoDaTela, { tipo: "campo" }> => b.tipo === "campo")
        .map((b) => ({
          chave: b.chave,
          rotulo: b.rotulo,
          tipo: b.entrada === "numero" ? ("numero" as const) : ("texto" as const),
          ...(b.obrigatorio ? { obrigatorio: true as const } : {}),
        })),
    ],
  };
}

/** O prefixo que separa uma tela DO TIME de uma do sistema no `refId` de um
 * nó. Sem ele, criar uma tela chamada "mesa" sequestraria a do sistema. */
export const PREFIXO_DA_TELA_DECLARADA = "tela:";

export const refIdDaTelaDeclarada = (id: string) => `${PREFIXO_DA_TELA_DECLARADA}${id}`;
export const idDaTelaDeclarada = (refId: string) =>
  refId.startsWith(PREFIXO_DA_TELA_DECLARADA) ? refId.slice(PREFIXO_DA_TELA_DECLARADA.length) : null;

/**
 * SPEC-110 fatia C — **as telas EM VIGOR**: as do sistema mais as do time, no
 * mesmo vocabulário. Quem consome uma tela não pergunta de onde ela veio — é
 * o análogo de `fluxosEmVigor`, e o prefixo do `refId` é o que as mantém
 * distinguíveis sem uma delas vencer a outra por acidente.
 */
export interface TelaEmVigor {
  /** O `refId` que um nó usa — `mesa` ou `tela:aprovacao`. */
  refId: string;
  id: string;
  nome: string;
  rotuloCurto: string;
  descricao: string;
  icone?: string;
  origem: "sistema" | "declarada";
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  /** Só nas declaradas: os blocos que o renderizador desenha. */
  blocos?: BlocoDaTela[];
}

export function telasEmVigor(documentoTelas?: unknown): TelaEmVigor[] {
  const doSistema: TelaEmVigor[] = TELAS_DO_SISTEMA.map((t) => ({
    refId: t.id,
    id: t.id,
    nome: t.nome,
    rotuloCurto: t.rotuloCurto,
    descricao: t.descricao,
    origem: "sistema",
    entrada: t.entrada,
    saida: t.saida,
  }));
  const declaradas: TelaEmVigor[] = normalizarTelas(documentoTelas).telas.map((t) => {
    const contrato = contratoDaTelaDeclarada(t);
    return {
      refId: refIdDaTelaDeclarada(t.id),
      id: t.id,
      nome: t.nome,
      // O nome que a pessoa deu É o rótulo do cartão: ela escolheu, e o
      // cartão ecoa o que ela escreveu (§387).
      rotuloCurto: t.nome,
      descricao: "Tela deste time.",
      ...(t.icone ? { icone: t.icone } : {}),
      origem: "declarada",
      entrada: contrato.entrada,
      saida: contrato.saida,
      blocos: t.blocos,
    };
  });
  return [...declaradas, ...doSistema];
}

export function telaEmVigorPorRefId(refId: string, documentoTelas?: unknown): TelaEmVigor | undefined {
  return telasEmVigor(documentoTelas).find((t) => t.refId === refId);
}

/**
 * SPEC-35 — a ESCRITA recusa o que a leitura tolera, nomeando. O que a
 * leitura descarta em silêncio some do documento salvo, e a pessoa só
 * descobre quando a tela abre sem o bloco que ela acabou de criar.
 */
export function validarEscritaTelas(documento: unknown): void {
  const bruto = (documento ?? {}) as Partial<ConfigTelas>;
  if (bruto.telas === undefined) return;
  if (!Array.isArray(bruto.telas)) throw new ConfigInvalida("`telas` precisa ser uma lista de telas");

  const vistos = new Set<string>();
  for (const [i, t] of (bruto.telas as Partial<TelaDeclarada>[]).entries()) {
    const posicao = i + 1;
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!id) throw new ConfigInvalida(`a tela na posição ${posicao} está sem "id" — seria descartada em silêncio ao salvar`);
    if (vistos.has(id)) throw new ConfigInvalida(`há duas telas com o id "${id}" — a segunda seria descartada em silêncio ao salvar`);
    vistos.add(id);

    const chaves = new Set<string>();
    const acoes: string[] = [];
    for (const [j, b] of (Array.isArray(t.blocos) ? (t.blocos as Record<string, unknown>[]) : []).entries()) {
      const onde = `na tela "${id}", o bloco na posição ${j + 1}`;
      const tipo = b?.tipo;
      if (tipo !== "texto" && tipo !== "dado" && tipo !== "campo" && tipo !== "acao") {
        throw new ConfigInvalida(`${onde} tem tipo desconhecido "${String(tipo)}" (aceitos: texto, dado, campo, acao)`);
      }
      if (tipo === "texto" && !(typeof b.markdown === "string" && b.markdown.trim())) {
        throw new ConfigInvalida(`${onde} é de texto e está vazio — um bloco que não diz nada não aparece`);
      }
      if (tipo === "dado" || tipo === "campo") {
        const chave = typeof b.chave === "string" ? b.chave.trim() : "";
        if (!chave) throw new ConfigInvalida(`${onde} está sem "chave" — é ela que liga o bloco à fiação`);
        if (chaves.has(chave)) {
          throw new ConfigInvalida(`${onde} repete a chave "${chave}" — duas chaves iguais disputariam o mesmo lugar no contrato`);
        }
        chaves.add(chave);
      }
      // Escolha sem opção é um select vazio: a pessoa não teria o que
      // escolher, e o obrigatório travaria o Avançar para sempre.
      if (tipo === "campo" && b.entrada === "escolha" && sanearOpcoes(b.opcoes).length === 0) {
        throw new ConfigInvalida(`${onde} é uma escolha sem opções — não haveria o que escolher`);
      }
      if (tipo === "acao") {
        if (!(DECISOES_DA_TELA as readonly unknown[]).includes(b.acao)) {
          throw new ConfigInvalida(`${onde} tem ação desconhecida "${String(b.acao)}" (aceitas: ${DECISOES_DA_TELA.join(", ")})`);
        }
        // D17a — o acionador é enlatado: dois "avançar" seria a pergunta sem
        // resposta ("qual vale?"), a mesma régua do gatilho duplicado.
        if (acoes.includes(String(b.acao))) {
          throw new ConfigInvalida(`na tela "${id}" há dois botões de "${String(b.acao)}" — um acionador por decisão`);
        }
        acoes.push(String(b.acao));
      }
    }
  }
}

/** As decisões que uma tela pode devolver (D2/D17: o catálogo é fechado — o
 * acionador é enlatado, nada programável). */
export const DECISOES_DA_TELA = ["avancar", "retornar"] as const;
export type DecisaoDaTela = (typeof DECISOES_DA_TELA)[number];

/**
 * SPEC-110 fatia B — a saída que a pessoa entrega ao Avançar, validada contra
 * o contrato declarado da tela. Devolve a mensagem do problema, ou `null`.
 *
 * A régua é a da casa (§9.3): o que a tela promete emitir, ela emite — campo
 * obrigatório ausente NÃO vira default, porque o nó seguinte receberia um
 * "vazio plausível" e ninguém saberia de onde veio.
 */
export function problemaNaSaidaDaTela(
  tela: { saida: CampoDoConector[] },
  saida: Record<string, unknown>
): string | null {
  const decisao = saida[CAMPO_DA_DECISAO.chave];
  if (!(DECISOES_DA_TELA as readonly unknown[]).includes(decisao)) {
    return `a tela precisa devolver "decisao" com ${DECISOES_DA_TELA.map((d) => `"${d}"`).join(" ou ")} — veio ${JSON.stringify(decisao)}`;
  }
  for (const campo of tela.saida) {
    if (!campo.obrigatorio) continue;
    const valor = saida[campo.chave];
    if (valor === undefined || valor === null || valor === "") {
      return `a tela não devolveu "${campo.chave}" (${campo.rotulo}), que é obrigatório — ausente não vira default`;
    }
  }
  return null;
}
