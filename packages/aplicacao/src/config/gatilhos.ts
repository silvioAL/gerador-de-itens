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
];

/** O parâmetro do nó que guarda a expressão do agendamento. Um lugar só
 * porque a tela, a validação e o sincronizador leem o mesmo nome. */
export const PARAMETRO_DA_EXPRESSAO = "expressao";

export function gatilhoDoSistema(id: string): GatilhoDoSistema | undefined {
  return GATILHOS_DO_SISTEMA.find((g) => g.id === id);
}

/** O id de nó que as FÁBRICAS usam para o gatilho — estável, porque o rastro
 * e os E2Es o nomeiam. */
export const ID_DO_NO_DE_GATILHO = "gatilho";
