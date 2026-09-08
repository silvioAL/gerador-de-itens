import type { CampoDoConector } from "./conectores.js";

/**
 * SPEC-107 fatia A — **as FUNÇÕES do sistema como catálogo, com o contrato
 * como dado.**
 *
 * Uma função é o mesmo "capacidade com contrato" que um conector já é
 * (`entrada`/`saida` em `CampoDoConector`), trocando o transporte: chamada em
 * processo no motor, não HTTP. O nó do fluxo vira UMA coisa só — capacidade
 * com contrato — com adaptadores diferentes por trás (§2.2 da SPEC).
 *
 * A lista é FECHADA e mora no código de propósito (§242): função nova entra
 * por decisão, com executor que a honre no mesmo commit — nunca por acidente.
 * O molde é `CONTRATO_DA_OPERACAO`: o registro é dado, e quem consome (a
 * paleta, o validador, o executor) deriva dele.
 *
 * ## Modo (b), dito em voz alta (§5.4)
 *
 * A função `derivacao` aceita QUALQUER `desenho` mapeado — um conector pode
 * trazer um desenho de fora e derivá-lo. A tese da SPEC-105 §6 ("mesmo
 * desenho → mesmos itens, sempre") fica formalmente REESCRITA: a promessa é
 * **"mesma fiação + mesmas entradas → mesmos itens"**, e a reprodutibilidade
 * ancora no rastro — o hash do fluxo (§9.5) mais as ENTRADAS gravadas por nó
 * de função (`RastroDoNo.entradas`).
 */

export interface GovernancaDaFuncao {
  /** O nível de acesso que executa esta função — atributo do registro, não
   * decisão de rota: quem monta portão lê daqui. */
  nivel: "operar";
  /** O recurso RBAC curável que a restringe quando algum papel o carrega —
   * hoje o mesmo da execução de fluxos, porque função só roda dentro de um. */
  recurso: "fluxos.executar";
}

export interface FuncaoDoSistema {
  id: string;
  /** O rótulo da interface nomeia a FUNÇÃO (§2.3) — "engine" e "derivar" não
   * aparecem em tela nenhuma. */
  nome: string;
  descricao: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  governanca: GovernancaDaFuncao;
  /**
   * SPEC-110 fatia F — **onde esta função roda**, como DADO do registro.
   *
   * `puro` (o default) é cálculo: `executarFuncao` o resolve sem rede e sem
   * banco, e é o que torna as funções testáveis à mão. `servidor` é a função
   * que ESCREVE — o executor mora na rota, junto do banco e da auditoria.
   *
   * Sem este campo, quem despacha teria de manter uma lista paralela de
   * "estas aqui são especiais", e a primeira função nova entraria só na
   * metade das listas — que é o §346 (meia-integração) esperando acontecer.
   */
  executor?: "puro" | "servidor";
}

/**
 * A lista fechada. `derivacao` e `ensaio` entram porque já existem puras e
 * testadas no motor (`derivar`, `simularCenarios`); as demais candidatas da
 * §2.2 esperam o caso real que as honre (§346: tipo sem executor é
 * meia-integração).
 */
export const FUNCOES_DO_SISTEMA: FuncaoDoSistema[] = [
  {
    id: "derivacao",
    nome: "Geração de itens (desenho → itens)",
    descricao: "Deriva os itens de trabalho de um desenho, com as regras e o design system do time.",
    entrada: [{ chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto", obrigatorio: true }],
    saida: [
      { chave: "itens", rotulo: "Itens derivados", tipo: "lista" },
      { chave: "avisos", rotulo: "Avisos da derivação", tipo: "lista" },
      { chave: "conformidade", rotulo: "Conformidade (ciclos, conflitos)", tipo: "objeto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
  {
    id: "ensaio",
    nome: "Ensaio de cenários",
    descricao: "Roda um cenário de lentidão sobre o desenho e devolve a leitura, com a âncora de hoje.",
    entrada: [
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto", obrigatorio: true },
      { chave: "cenario", rotulo: "Cenário de lentidão", tipo: "objeto" },
    ],
    saida: [{ chave: "leitura", rotulo: "Leitura do ensaio", tipo: "objeto" }],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
  },
  {
    /**
     * SPEC-110 fatia F (D11) — **o feedback do PDCA como componente.**
     *
     * O ciclo de melhoria já tem porta (a aba PDCA) e gravação (`POST
     * /pdca/feedback`). O que faltava era ele ser FIÁVEL: sem isto, um fluxo
     * que termina perguntando "o que faltou aqui?" não tem onde pousar a
     * resposta, e a pessoa é mandada para outra tela — que é exatamente o
     * corte de contexto que o PDCA existe para fechar.
     *
     * O executor chama a MESMA gravação da rota (§263), com a mesma auditoria:
     * um segundo caminho de escrita para o mesmo dado seria a régua duplicada
     * que esta casa já pagou para aprender.
     */
    id: "pdca-feedback",
    nome: "Registrar feedback (PDCA)",
    descricao: "Grava um feedback no ciclo de melhoria do time — o mesmo que a aba PDCA mostra.",
    entrada: [
      { chave: "texto", rotulo: "O que registrar", tipo: "texto", obrigatorio: true },
      { chave: "contexto", rotulo: "Contexto (de onde veio)", tipo: "texto" },
    ],
    saida: [{ chave: "feedbackId", rotulo: "Feedback gravado (id)", tipo: "texto" }],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    // Escreve: o executor mora na rota, com o banco e a auditoria.
    executor: "servidor",
  },
  /**
   * SPEC-110 fatia G (D13) — **o PDCA inteiro fiável.**
   *
   * O ciclo de melhoria já era um lugar (a aba) e virou um CAMINHO: ler o que
   * o time reclamou, ler a configuração de hoje, propor um ajuste, alguém
   * revisar numa tela, e aplicar. Cada passo é um componente com contrato — é
   * o que permite ao time mudar o desenho do próprio ciclo (rodar semanal em
   * vez de manual, pôr outro agente, acrescentar uma aprovação) sem código.
   *
   * As quatro rodam no SERVIDOR: leem e escrevem banco. A §4.G as listava em
   * `DADOS_DO_SISTEMA`, mas aquele registro virou "a DEMANDA como dado" na
   * fatia F — o cabeçalho do cartão diz "DEMANDA", e um `config-ler` ali
   * apareceria como "DEMANDA / Ler configuração", que é falso. Aqui elas são o
   * que são: capacidades do sistema com contrato.
   */
  {
    /**
     * SPEC-110 fatia I (D15) — **a spec como SAÍDA do fluxo.**
     *
     * Fecha o terceiro termo do vocabulário original do usuário: integração
     * externa → agente → **artefato**. Até aqui a spec existia como efeito da
     * derivação e como montagem viva da tela; ela não era uma coisa que um
     * desenho pudesse PRODUZIR e passar adiante.
     *
     * ## A unidade é o ITEM, não a demanda
     *
     * Correção do usuário em revisão: *"isso varia com o desenho, pode ter
     * vários itens"*. N itens → N specs. `specPorItem` é a lista; `spec` é o
     * agregado que a tela já mostra — os dois saem da MESMA montagem
     * (`renderizarItemEspecificacao` por item, `gerarEspecificacaoEntrega` no
     * todo). Uma segunda montagem seria o §263 de novo, e desta vez sobre o
     * artefato que a casa inteira entrega.
     *
     * Roda no SERVIDOR porque precisa do vocabulário do time resolvido — o
     * mesmo contexto que a derivação usa.
     */
    id: "gerar-spec",
    nome: "Gerar a especificação (por item)",
    descricao:
      "Monta a especificação de cada item e o documento agregado, com o vocabulário do time — a mesma montagem que a tela mostra.",
    /**
     * O insumo é o DESENHO, não os itens gravados — medido na implementação.
     * O item persistido é o item RENDERIZADO (chave, título, corpo); a
     * montagem por item precisa da ATIVIDADE derivada, que carrega a aresta e
     * o componente. Passar o item gravado estourava em `edgeId`.
     */
    entrada: [
      { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto", obrigatorio: true },
      { chave: "escrita", rotulo: "O que a pessoa escreveu (seções de julgamento)", tipo: "objeto" },
      { chave: "contexto", rotulo: "Contexto do produto e da demanda", tipo: "texto" },
      { chave: "titulo", rotulo: "Título da especificação", tipo: "texto" },
    ],
    saida: [
      // A lista é a resposta da correção do usuário: cada item com a spec DELE.
      { chave: "specPorItem", rotulo: "Uma spec por item (chave + markdown + lacunas)", tipo: "lista" },
      { chave: "spec", rotulo: "A especificação agregada (documento)", tipo: "documento" },
      { chave: "lacunas", rotulo: "Quantas lacunas ficaram por preencher", tipo: "numero" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    executor: "servidor",
  },
  {
    id: "pdca-ler-feedbacks",
    nome: "Ler feedbacks do ciclo (PDCA)",
    descricao: "Traz os feedbacks que ainda esperam alguém — os mesmos que a aba PDCA mostra como pendentes.",
    entrada: [
      // O estado é parâmetro porque "o que ainda espera alguém" é a pergunta
      // comum, mas revisar o que já virou ajuste também é um uso legítimo.
      { chave: "estado", rotulo: "Estado (vazio = novo, o que ainda espera alguém)", tipo: "texto" },
      { chave: "limite", rotulo: "Quantos no máximo (vazio = 20)", tipo: "numero" },
    ],
    saida: [
      { chave: "feedbacks", rotulo: "Feedbacks (texto, quem, quando)", tipo: "lista" },
      { chave: "quantidade", rotulo: "Quantos vieram", tipo: "numero" },
      // O texto corrido existe para o AGENTE: um prompt recebe texto, e
      // concatenar a lista no nó de transformação seria trabalho repetido em
      // todo fluxo de PDCA que alguém desenhasse.
      { chave: "resumo", rotulo: "Os feedbacks em texto corrido (para o agente ler)", tipo: "texto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    executor: "servidor",
  },
  {
    id: "config-ler",
    nome: "Ler uma configuração",
    descricao: "Traz o documento de configuração em vigor — o mesmo que a tela de configurações mostra.",
    entrada: [{ chave: "chave", rotulo: "Qual configuração (regras, pipeline-agentes, telas…)", tipo: "texto", obrigatorio: true }],
    // Só o documento: ecoar a `chave` de volta repetiria uma chave entre
    // entrada e saída, e a régua da casa recusa (a mesma chave nos dois lados
    // torna ambíguo o que o painel de mapeamento está oferecendo).
    saida: [{ chave: "documento", rotulo: "O documento em vigor", tipo: "objeto" }],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    executor: "servidor",
  },
  {
    id: "config-propor-ajuste",
    nome: "Propor ajuste de configuração",
    /**
     * D13, que não se reabre: **fluxo não escreve configuração direto.** Ele
     * PROPÕE, e a proposta passa pelo mesmo caminho de quem pede pela aba —
     * com dono, versão-alvo e auditoria. Um fluxo que reescrevesse regras
     * sozinho seria a única escrita do produto sem alguém atrás dela.
     */
    descricao: "Cria uma solicitação de ajuste (pendente) — a mesma que a aba PDCA mostra. Nenhum fluxo escreve configuração direto.",
    entrada: [
      { chave: "descricao", rotulo: "O que se está pedindo, em uma frase", tipo: "texto", obrigatorio: true },
      { chave: "operacao", rotulo: "A mudança como dado (é ela que permite aplicar)", tipo: "objeto" },
      { chave: "recurso", rotulo: "Qual configuração (vazio = regras)", tipo: "texto" },
      { chave: "feedbackId", rotulo: "De qual feedback nasceu (fecha a ponte do ciclo)", tipo: "texto" },
    ],
    saida: [
      { chave: "solicitacaoId", rotulo: "Solicitação criada (id)", tipo: "texto" },
      { chave: "estado", rotulo: "Estado da solicitação", tipo: "texto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    executor: "servidor",
  },
  {
    id: "config-aplicar-ajuste",
    nome: "Aplicar ajuste de configuração",
    descricao:
      "Aprova e aplica uma solicitação — pelo mesmo caminho da aba, com o mesmo portão. Sem permissão, o nó falha nomeando, e a solicitação fica pendente para alguém decidir na aba.",
    entrada: [{ chave: "solicitacaoId", rotulo: "Qual solicitação aplicar", tipo: "texto", obrigatorio: true }],
    // Sem ecoar o `solicitacaoId` que entrou: quem precisar dele à jusante
    // liga a aresta em quem o PRODUZIU (o nó que propôs), não em quem o
    // consumiu.
    saida: [
      { chave: "estado", rotulo: "Estado depois de aplicar", tipo: "texto" },
      { chave: "aplicadaPor", rotulo: "Quem aplicou", tipo: "texto" },
    ],
    governanca: { nivel: "operar", recurso: "fluxos.executar" },
    executor: "servidor",
  },
];

export function funcaoDoSistema(id: string): FuncaoDoSistema | undefined {
  return FUNCOES_DO_SISTEMA.find((f) => f.id === id);
}
