/**
 * SPEC-31 Fase 4 — a porta de Credenciais do provedor de IA.
 *
 * No modo local a credencial mora em `~/.gerador/credenciais.json`, fora do
 * projeto e portanto fora do git — a decisão original, e continua certa: é a
 * chave da PESSOA, na máquina dela.
 *
 * No modo hospedado não existe "a máquina dela". A credencial é da organização,
 * fica no banco, e vale para todo mundo que usa aquela instância. Isso muda o
 * risco: uma chave que antes só o dono via passa a ser usada por terceiros.
 * Por isso a porta **não devolve a chave** em nenhuma leitura de listagem —
 * só `resumir`, que mascara. Quem precisa do valor inteiro é o adaptador do
 * provedor, no momento da chamada, e mais ninguém.
 */
export interface CredencialIa {
  baseUrl?: string;
  chave?: string;
  modelo?: string;
  cabecalhos?: Record<string, string>;
  formatoJson?: string;
  /** SPEC-30 — endereço da transcrição, quando o destino do chat não faz áudio
   * (o caso do Ollama). Ausente = usa o mesmo `baseUrl`. */
  baseUrlTranscricao?: string;
  /**
   * SPEC-30 Fase 2 — "este modelo enxerga imagem", marcado à mão.
   *
   * Existe porque nenhuma lista conhece o modelo que a empresa batizou: o
   * preset cobre os destinos públicos, e o gateway interno precisa de alguém
   * dizendo. Padrão ausente = não vê.
   */
  visao?: boolean;
}

/** O que pode atravessar HTTP: nunca a chave inteira. */
export interface ResumoCredencial {
  configurado: boolean;
  baseUrl?: string;
  modelo?: string;
  /** SPEC-30 Fase 2 — a marcação manual de visão. Não é segredo: dizer que o
   * modelo enxerga imagem não expõe nada, e a tela precisa disso pra decidir
   * se oferece o anexo. */
  visao?: boolean;
  /**
   * ACHADO REAL, configurando voz com gateway da Anthropic: este campo existia
   * no formulário, no zod da rota e na coluna do banco — e NÃO voltava aqui.
   * Efeito: a aba "Modelo de IA" carregava o endereço de transcrição em branco
   * mesmo com valor gravado, e o próximo "Salvar" mandava `undefined`,
   * APAGANDO a configuração de voz sem que ninguém tivesse pedido isso.
   *
   * Mesma classe do #286 (`baseUrlTranscricao` descartado ao montar o
   * provedor), uma camada acima: lá o campo se perdia na ida, aqui na volta.
   * Não é segredo — é um endereço, como `baseUrl`, que já volta.
   */
  baseUrlTranscricao?: string;
  chaveMascarada?: string;
}

export interface RepositorioDeCredenciais {
  /** Uso interno: quem chama é o provedor, na hora de fazer a requisição. */
  obter(provedorId: string): Promise<CredencialIa | null>;
  salvar(provedorId: string, credencial: CredencialIa): Promise<void>;
  /** O que a UI pode ver. */
  resumir(provedorId: string): Promise<ResumoCredencial>;
}

/** Mascara para exibição — três primeiros e quatro últimos, nunca o meio. */
export function resumirCredencialIa(c: CredencialIa | null | undefined): ResumoCredencial {
  if (!c?.baseUrl || !c?.chave) {
    return {
      configurado: false,
      baseUrl: c?.baseUrl,
      modelo: c?.modelo,
      visao: c?.visao,
      baseUrlTranscricao: c?.baseUrlTranscricao,
    };
  }
  return {
    configurado: true,
    baseUrl: c.baseUrl,
    modelo: c.modelo,
    visao: c.visao,
    baseUrlTranscricao: c.baseUrlTranscricao,
    chaveMascarada: `${c.chave.slice(0, 3)}…${c.chave.slice(-4)}`,
  };
}
