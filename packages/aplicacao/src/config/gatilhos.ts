import type { CampoDoConector } from "./conectores.js";

/**
 * SPEC-110 fatia A — **o GATILHO como nó: o fluxo diz QUANDO roda.**
 *
 * A queixa que abriu a SPEC-110 foi literal: *"não entendi qual o objetivo do
 * botão executar"*. O botão não tinha propósito legível porque o "quando" não
 * existia no desenho — era uma convenção escondida no shell. O gatilho é essa
 * convenção virando COMPONENTE: o primeiro nó do fluxo diz o que o dispara, e
 * o botão passa a ser o gesto DELE ("▶ Rodar agora").
 *
 * O molde é o de `FUNCOES_DO_SISTEMA` (SPEC-107 A, §242): registro FECHADO no
 * código, com o contrato como dado. Gatilho novo entra por decisão, com quem o
 * honre no mesmo commit — a família inteira já está decidida (D1): `manual`
 * (esta fatia), `agendamento` (fatia E), `webhook` (fatia L) e `screen` (o par
 * screen→fluxo, SPEC-111).
 *
 * **Sem contrato de dados no v1** (D1): manual e agendamento não emitem nada —
 * o gatilho é a âncora do "quando", e os dados continuam nascendo nos nós de
 * mesa/integração. `saida` existe no registro porque o webhook (L) emite o
 * payload recebido; quem consome deriva do registro, não de um `if` por tipo.
 */

/** De onde partiu o disparo — o que o rastro do gatilho registra. A lista é a
 * família da D1, inteira: os três primeiros nascem nas fatias A/E/L, e
 * `screen` na SPEC-111. */
export const ORIGENS_DO_DISPARO = ["manual", "agendamento", "webhook", "screen"] as const;
export type OrigemDoDisparo = (typeof ORIGENS_DO_DISPARO)[number];

export interface GatilhoDoSistema {
  id: OrigemDoDisparo;
  /** O rótulo da interface nomeia o GESTO, não o tipo (§2.3). É o que a
   * paleta e o painel mostram — a frase inteira. */
  nome: string;
  /**
   * O mesmo gesto em duas palavras, para o CARTÃO do canvas. A frase inteira
   * ali estica o cartão e esconde o vizinho sob ele — o sintoma que a §0.9 da
   * SPEC-110 anota (fontes largas na CI escondendo handles), medido na
   * validação visual desta fatia: "Manual — roda quando alguém manda" cobria
   * a Mesa de projeto ao lado.
   */
  rotuloCurto: string;
  descricao: string;
  /** O que o gatilho emite para o primeiro nó. Vazio = só âncora de "quando". */
  saida: CampoDoConector[];
}

export const GATILHOS_DO_SISTEMA: GatilhoDoSistema[] = [
  {
    id: "manual",
    nome: "▶ Manual — roda quando alguém manda",
    rotuloCurto: "▶ Manual",
    descricao:
      "É o que o botão “▶ Rodar agora” dispara. Quem abre o fluxo e manda rodar é a origem — a execução fica no histórico com o e-mail de quem mandou.",
    saida: [],
  },
  {
    /**
     * SPEC-110 fatia E (D7) — *"senti falta de componente scheduler para
     * outros desenhos"*. O relógio é o segundo membro da família: a expressão
     * (cron de 5 campos, UTC) mora em `parametros.expressao` do nó, e salvar
     * o fluxo sincroniza a tabela de agendamentos.
     *
     * Sem saída, como o manual (D1): o relógio diz QUANDO, não O QUÊ.
     */
    id: "agendamento",
    nome: "🕐 Agendamento — roda na hora marcada",
    rotuloCurto: "🕐 Agendado",
    descricao:
      "Roda sozinho, na expressão que você escrever (cron de 5 campos, em UTC). O “▶ Rodar agora” continua funcionando — agendar não tira o gesto manual.",
    saida: [],
  },
  {
    /**
     * SPEC-110 fatia L (D1) — **o gatilho que ALGUÉM DE FORA puxa.**
     *
     * Decisão do usuário: *"quanto ao webhook, pode ser um acionador"*. E a
     * correção de escopo que a fatia carrega: **o webhook NÃO é coberto pelo
     * conector HTTP**. Conector é SAÍDA — nós chamamos alguém, com endereço,
     * método e segredo nossos. O webhook é ENTRADA — alguém nos chama, num
     * endereço nosso, sem sessão, autenticado por um token que a gente emitiu.
     * Direções opostas; confundi-las daria ao produto um buraco no lugar de
     * uma porta.
     *
     * **É o primeiro gatilho com SAÍDA** (D1), e por isso a `saida` do registro
     * fica vazia aqui: o que ele emite não é do TIPO, é do NÓ — os campos que
     * a pessoa declarou extrair do corpo. Quem quiser o contrato de um nó de
     * webhook chama `saidaDoGatilho(no)`, não lê este campo.
     */
    id: "webhook",
    nome: "🔗 Webhook — roda quando um sistema chama",
    rotuloCurto: "🔗 Webhook",
    descricao:
      "Um endereço próprio, com token, que outro sistema chama por POST. Os campos que você declarar são extraídos do corpo e entram no fluxo; o resto do corpo é ignorado de propósito.",
    saida: [],
  },
];

/** O parâmetro do nó que guarda os campos extraídos do corpo do webhook. */
export const PARAMETRO_DOS_CAMPOS = "campos";

/**
 * SPEC-110 fatia L — **o que o webhook extrai do corpo.**
 *
 * `caminho` é o MESMO vocabulário do conector (SPEC-105 §9.4: `$`, `.campo` e
 * `[n]`, nada mais). Reusar em vez de inventar é o que faz quem já declarou uma
 * integração saber declarar um webhook sem aprender nada novo — e é a mesma
 * régua de escrita a validar os dois.
 */
export interface CampoDoWebhook {
  chave: string;
  rotulo?: string;
  /** Ausente = `$.{chave}`, como no conector. */
  caminho?: string;
}

/** Tolerante na leitura (SPEC-35): o que não tem forma de campo é descartado,
 * e a ESCRITA é quem recusa nomeando. */
export function camposDoWebhook(parametros: Record<string, unknown> | undefined): CampoDoWebhook[] {
  const bruto = parametros?.[PARAMETRO_DOS_CAMPOS];
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((c) => (c ?? {}) as Record<string, unknown>)
    .map((c) => ({
      chave: typeof c.chave === "string" ? c.chave.trim() : "",
      ...(typeof c.rotulo === "string" && c.rotulo.trim() ? { rotulo: c.rotulo.trim() } : {}),
      ...(typeof c.caminho === "string" && c.caminho.trim() ? { caminho: c.caminho.trim() } : {}),
    }))
    .filter((c) => c.chave);
}

/**
 * O contrato de saída de UM nó de gatilho. Para manual e agendamento é o do
 * registro (vazio); para o webhook são os campos declarados NELE — é o que
 * permite ao painel de mapeamento oferecer o que o corpo traz, e ao aviso de
 * tipo funcionar na aresta que sai do gatilho.
 */
export function saidaDoGatilho(no: { refId: string; parametros?: Record<string, unknown> }): CampoDoConector[] {
  const gatilho = gatilhoDoSistema(no.refId);
  if (!gatilho) return [];
  if (gatilho.id !== "webhook") return gatilho.saida;
  return camposDoWebhook(no.parametros).map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo ?? c.chave,
    // O corpo de um webhook é JSON livre: o tipo declarado é `texto` porque é
    // o que a casa usa para "veio de fora e não prometemos a forma".
    tipo: "texto" as const,
    ...(c.caminho ? { caminho: c.caminho } : {}),
  }));
}

/** O parâmetro do nó que guarda a expressão do agendamento. Um lugar só
 * porque a tela, a validação e o sincronizador leem o mesmo nome. */
export const PARAMETRO_DA_EXPRESSAO = "expressao";

export function gatilhoDoSistema(id: string): GatilhoDoSistema | undefined {
  return GATILHOS_DO_SISTEMA.find((g) => g.id === id);
}

/** O id de nó que as FÁBRICAS usam para o gatilho — estável, porque o rastro
 * e os E2Es o nomeiam. */
export const ID_DO_NO_DE_GATILHO = "gatilho";
