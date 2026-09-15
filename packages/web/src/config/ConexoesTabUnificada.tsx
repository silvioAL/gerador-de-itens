import { ExportacaoTab } from "./ExportacaoTab";
import { ModeloIaTab } from "./ModeloIaTab";
import type { ConfigExportador } from "../api/client";

/**
 * SPEC-118 fatia G — **as três conexões numa tela só, agrupadas por direção.**
 *
 * ## A medição, e por que a tela parecia duas ferramentas
 *
 * | | **Modelo de IA** | **Exportação** |
 * |---|---|---|
 * | O que configura | um destino de LLM | 1 endereço de topo + N destinos |
 * | Campos | `baseUrl`, `chave`, `modelo`, `cabecalhos`, `visao`, `formatoJson`… | `endpoint`, `rotulo`, `cabecalhos`, `metodo`, `envelope`… |
 * | Como se testa | botão "Testar conexão" | ❌ não se testava |
 *
 * **Sete campos de um lado, oito do outro, e só um nome em comum.** As duas
 * telas descreviam a mesma coisa — *um endereço HTTP com autenticação e um
 * formato de corpo* — em dois vocabulários.
 *
 * ## O que esta tela É, e o que ela deliberadamente NÃO é
 *
 * **É reorganização. O dado salvo não muda** (§3.4): quem configurou pelos
 * formulários continua com a configuração valendo, sem tocar em nada. As duas
 * abas viram duas seções desta, e os componentes são os MESMOS — nenhum campo
 * é reescrito, porque reescrever é como `visao`, `formatoJson`,
 * `baseUrlTranscricao` e `espaco` somem numa travessia. Eles não são famosos, e
 * são exatamente os que ninguém sente falta até precisar.
 *
 * **Não é uma terceira fonte de verdade.** Ela não guarda nada: cada seção
 * salva pelo caminho que já salvava.
 *
 * ## A forma, e ela vem da correção do usuário (§2.0)
 *
 * > *"os agentes no gateway vou deixar no gateway… o gateway é o mesmo mas
 * > pode variar o endpoint"*
 *
 * Não são três conexões independentes:
 *
 * ```
 * 🧠 O gateway de IA     — onde o assistente e a esteira pensam
 * 🏠 O gateway da casa   — UM endereço, UMA autenticação
 *    ├── ⬇ importar  → contexto para desenhar: ADR e documento, via assistente
 *    └── ⬆ exportar  → o que ficou pronto: o issue do item e a spec dele
 * ```
 *
 * A direção da seta é a informação que faltava na tela de hoje (§1.2), e é a
 * primeira coisa que alguém procura.
 */
export interface ConexoesTabUnificadaProps {
  /** §235 — dado de demonstração do tour, repassado à seção da casa. */
  demonstracao?: ConfigExportador;
  /**
   * SPEC-118 fatia G × SPEC-28 — **a permissão continua por SEÇÃO, e isto é
   * uma correção sobre a resposta da pergunta 2.**
   *
   * A SPEC decidiu que a tela nova SUBSTITUI as duas, e listou duas garantias
   * para a travessia: nenhum campo se perde, e os deep-links antigos chegam em
   * algum lugar. Faltou uma terceira, e ela é de segurança: as duas abas
   * tinham **recursos de RBAC diferentes** (`credenciais-ia` e `exportador`),
   * e `rbac-cadeado-e-pedido` guarda que quem não pode ver credencial não vê a
   * aba dela.
   *
   * Fundir as duas sem mais nada daria a quem só cuida da exportação uma visão
   * do formulário de credencial de IA — uma ampliação de acesso que ninguém
   * pediu, por efeito colateral de uma reorganização de tela.
   *
   * Então a fusão é do MENU; a régua continua onde estava. Quem pode uma coisa
   * vê uma seção; quem pode as duas vê as duas.
   */
  podeIa?: boolean;
  podeGateway?: boolean;
}

export function ConexoesTabUnificada({
  demonstracao,
  podeIa = true,
  podeGateway = true,
}: ConexoesTabUnificadaProps = {}) {
  return (
    <div data-testid="config-conexoes-unificada">
      <p style={introEstilo}>
        Os endereços por onde o produto fala com o mundo. São dois gateways com papéis diferentes:{" "}
        <strong>o de IA</strong>, onde o assistente e a esteira pensam, e <strong>o da casa</strong>, por onde os itens
        e as specs vão e de onde os ADRs vêm.
      </p>

      {podeIa && (
      <section data-testid="conexao-ia" style={secaoEstilo}>
        <h3 style={tituloEstilo}>🧠 IA — onde o assistente e a geração dos itens rodam</h3>
        <ModeloIaTab />
      </section>
      )}

      {podeGateway && (
      <section data-testid="conexao-casa" style={secaoEstilo}>
        <h3 style={tituloEstilo}>🏠 O gateway da casa — um endereço, uma autenticação</h3>
        <p style={{ ...introEstilo, marginTop: 0 }}>
          <strong>⬇ Importar</strong> é contexto que acelera o desenho: ADRs e documentos da casa chegam à{" "}
          <strong>mesa</strong>, pelo assistente — nada entra no desenho sem alguém aceitar.{" "}
          <strong>⬆ Exportar</strong> é o que ficou pronto: os itens e as specs deles. Os dois saem pelo mesmo gateway —
          o que varia é o endpoint de cada agente.
        </p>
        <ExportacaoTab demonstracao={demonstracao} />
      </section>
      )}
    </div>
  );
}

const introEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  maxWidth: 760,
  margin: "0 0 14px",
};

const secaoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
};

const tituloEstilo: React.CSSProperties = {
  fontSize: 14,
  color: "var(--texto)",
  margin: "0 0 10px",
};
