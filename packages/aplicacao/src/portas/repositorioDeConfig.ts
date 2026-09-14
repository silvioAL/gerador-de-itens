import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";

export { CAMPO_GLOBAL };

/**
 * SPEC-31 Fase 3 — a porta de Configuração.
 *
 * Os documentos de config que hoje só existem como arquivo no modo local:
 * a tabela de regras de refinamento, a esteira de agentes e o template do
 * prompt único. O modo hospedado não tem nenhum deles — não tem rota, não tem
 * tabela, e quem sobe o Docker fica com o default compilado, sem como mudar.
 *
 * O documento é opaco para a porta: quem sabe interpretar `regras` é o engine,
 * e duplicar essa validação no repositório criaria duas fontes de verdade
 * sobre o que é uma regra válida.
 */
/** `prompt-unico` saiu daqui quando a feature foi removida (ver JOURNEY §143):
 * documento sem tela, sem rota e sem uso. Linha do banco com essa chave passa a
 * ser rejeitada por `ehChaveConfig`, que é o comportamento certo — dado órfão
 * não deve voltar a ser lido como se fosse configuração viva. */
/** SPEC-49 — `exportador` é o endereço do AGENTE que fala com o tracker: o
 * gerador não implementa Jira, chama quem implementa (mesma disciplina do
 * gateway de IA). */
/** SPEC-79 fatia A — `tokens` entra aqui e ganha GET/PUT de graça: a rota de
 * config é genérica por chave desde a SPEC-31. Documento novo e não tabela
 * nova pelo mesmo motivo que os outros três: `config_documentos` já é chaveado
 * por (chave, timeId), e uma tabela por tipo de configuração seria a quarta
 * forma de guardar a mesma coisa. */
/**
 * SPEC-102 fatia D — `conexoes`: as regras de ligação por tipo de nó de destino.
 *
 * **Por que ela precisou existir.** `edgeTypes`/`edgeRules` moram em
 * `config/diagrama.json`, um arquivo estático servido por `fetch`. Quando o
 * `edgeRules.motor.default` estava errado (dizia `http` para uma invocação que
 * não atravessa a rede), **não havia caminho de escrita nenhum**: a única saída
 * era editar o arquivo e reconstruir a imagem.
 *
 * **É ORGANIZACIONAL, e o `timeId` aqui é sempre `CAMPO_GLOBAL`** (SPEC-102
 * §5.3). Não é limitação de implementação, é a decisão: *"esta chamada não
 * atravessa a rede"* é fato da arquitetura, não preferência de time. Dois times
 * discordando fariam o MESMO desenho produzir itens diferentes — o determinismo
 * que a SPEC-101 §4 usou para recusar regra por time do nó.
 *
 * O documento guarda só **sobreposições**: `{ regras: { [tipoNo]: { default,
 * valid } } }`. O arquivo continua sendo a base, e o que não for sobrescrito
 * continua vindo dele — mesmo molde de `campos_no` sobre o `spec` estático.
 */
export const CHAVES_CONFIG = ["regras", "pipeline-agentes", "exportador", "tokens", "conexoes"] as const;

export type ChaveConfig = (typeof CHAVES_CONFIG)[number];

export function ehChaveConfig(valor: string): valor is ChaveConfig {
  return (CHAVES_CONFIG as readonly string[]).includes(valor);
}

export interface DocumentoConfig {
  chave: ChaveConfig;
  timeId: string;
  documento: unknown;
  /**
   * A versão do gerador cujo template semeou este documento — `null` quando
   * veio de antes desta fase, que é justamente o caso interessante: config de
   * outra era, que a ferramenta nunca sobrescreve e, até agora, nunca comentava.
   */
  versaoTemplate: string | null;
  atualizadoEm: string;
}

export interface RepositorioDeConfig {
  /** O do time, se houver; senão o global; senão `null` (nunca editado). */
  obter(chave: ChaveConfig, timeId?: string): Promise<DocumentoConfig | null>;
  /**
   * SPEC-86 fatia B — o documento de um PRODUTO, sem escada nenhuma.
   *
   * Método próprio, e não um parâmetro a mais no `obter`, **porque a semântica é
   * outra**: o `obter` resolve `time → global → template`, que é substituição —
   * quem tem o próprio não vê o de cima. Aqui não há degrau: ou o produto
   * declarou o documento, ou não declarou (`null`), e quem soma as duas coisas é
   * `regrasEmVigor`, no engine.
   *
   * Enfiar isto no `obter` faria o produto herdar por substituição, que é
   * exatamente o congelamento que a SPEC-86 §1 existe para evitar.
   */
  obterDoProduto(chave: ChaveConfig, timeId: string, produtoId: string): Promise<DocumentoConfig | null>;
  /** Upsert pela chave natural (`chave`, `timeId`). */
  salvar(
    chave: ChaveConfig,
    timeId: string,
    documento: unknown,
    versaoTemplate: string | null
  ): Promise<DocumentoConfig>;
  /** Upsert do documento de um produto — chave natural (`chave`, `timeId`, `produtoId`). */
  salvarDoProduto(
    chave: ChaveConfig,
    timeId: string,
    produtoId: string,
    documento: unknown,
    versaoTemplate: string | null
  ): Promise<DocumentoConfig>;
}
