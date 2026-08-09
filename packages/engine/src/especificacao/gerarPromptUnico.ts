import type { Atividade, Diagrama, ValorSpec } from "../model/types.js";
import type { RegrasConfig } from "../config/types.js";
import { gerarChecklistTecnico, gerarCiclosDeTeste } from "../refinamento/gerarRefinamento.js";
import { extrairVariaveis } from "./gerarEspecificacaoEntrega.js";

/**
 * SPEC-25 §5.5 / Fase 2.1 — o modo "prompt único".
 *
 * O fluxo que o usuário roda hoje na empresa não é a esteira: é **um prompt
 * gigante** colado no wrapper corporativo, que devolve o markdown de todas as
 * histórias de uma vez. Enquanto o token não sai (§8.1), esse é o caminho que
 * funciona — e ele não precisa de provedor nenhum conectado: a ferramenta
 * monta o texto, a pessoa cola onde já cola.
 *
 * **Isto não substitui a esteira, e a spec registra a comparação honesta
 * (§5.5).** O que o prompt único NÃO tem: formato garantido, revisão campo a
 * campo dentro da ferramenta, e propagação de mudança depois. O que ele tem, e
 * é o ponto: funciona hoje, no ambiente real, sem depender de liberação.
 *
 * O que muda em relação ao protótipo legado (`gerador_de_itens-2.html`): lá o
 * template era um arquivo que o usuário subia a cada sessão e as variáveis
 * eram trocadas com `String.replace` solto. Aqui o template é config do
 * projeto, e as variáveis são um conjunto FECHADO validado — um template não
 * pode citar variável que o motor não sabe preencher, e o erro aparece na
 * edição, não como `{{tipoErrado}}` literal no meio do prompt colado.
 */
export const VARIAVEIS_PROMPT_UNICO = [
  "descricaoEpico",
  "contextoAdicional",
  "itensBreakDownContent",
  "requisitosTecnicos",
  "ciclosTeste",
  "tecnologiasEnvolvidas",
  "contextosAplicaveis",
  "timestamp",
] as const;

/** Nomes de variável que o template usa mas o motor não sabe preencher. */
export function validarTemplatePromptUnico(template: string): string[] {
  const validas: readonly string[] = VARIAVEIS_PROMPT_UNICO;
  return extrairVariaveis(template).filter((v) => !validas.includes(v));
}

/**
 * Template padrão. Deliberadamente mais curto que o do protótipo legado:
 * boa parte daquele texto existia para conter alucinação (volumetria em
 * branco, "NUNCA misturar teste com refinamento", indicador literal), e isso
 * aqui **já é determinístico** — o checklist técnico, os ciclos de teste e a
 * volumetria chegam prontos do motor, não são pedidos ao modelo. Sobra para o
 * modelo o que é de fato textual: história, critérios, contrato.
 */
export const TEMPLATE_PROMPT_UNICO_PADRAO = `Você é um analista técnico. Escreva o refinamento das histórias abaixo em markdown.

## Demanda
{{descricaoEpico}}

## Contexto adicional
{{contextoAdicional}}

## Itens já quebrados (NÃO invente itens novos, NÃO junte, NÃO remova)
{{itensBreakDownContent}}

## Requisitos técnicos aplicáveis (já derivados das regras do time — use como está)
{{requisitosTecnicos}}

## Ciclos de teste aplicáveis (já derivados — use como está)
{{ciclosTeste}}

## Tecnologias envolvidas
{{tecnologiasEnvolvidas}}

## Contextos aplicáveis
{{contextosAplicaveis}}

---

Para CADA item da lista, e na mesma ordem, escreva:

### <número>. <rótulo>
**História de usuário:** Como <papel>, quero <ação>, para <benefício>.
**Critérios de aceite:** lista numerada, cada um verificável.
**Contrato:** request, response e erros, quando o item expuser interface.
**Observações técnicas:** só o que não estiver nos requisitos já listados acima.

Regras:
- Não repita os requisitos técnicos nem os ciclos de teste: eles já estão definidos.
- Não invente volumetria, prazo ou estimativa.
- Se faltar informação para um item, escreva "⚠️ falta definir: <o quê>" em vez de supor.
`;

export interface OpcoesPromptUnico {
  regras?: RegrasConfig;
  /** `quebra.demandInfo` — a descrição do épico. */
  demandInfo?: string;
  /** `quebra.anexosContexto` — material extra colado pelo usuário. */
  contextoAdicional?: string;
  template?: string;
  /** `quebra.respostasItens` — o que já foi escrito (por humano ou IA
   * confirmada) entra no prompt para o modelo não reescrever do zero. */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
  /** Injetável para o teste — sem isso o prompt mudaria a cada segundo e
   * duas gerações nunca seriam comparáveis. */
  agora?: Date;
}

const SEM_DEMANDA = "[INFORMAÇÕES DA DEMANDA NÃO INFORMADAS]";
const SEM_CONTEXTO = "[Nenhum contexto adicional informado]";
const SEM_REQUISITOS = "[Nenhum requisito técnico específico para estas tecnologias/contextos]";
const SEM_CICLOS = "[Nenhum ciclo de teste específico para estas tecnologias/contextos]";

/** Só o que a pessoa (ou a IA já confirmada) escreveu de fato conta — resposta
 * sugerida e não confirmada é palpite, e mandá-la como se fosse decisão faria
 * o modelo construir em cima de algo que ninguém aprovou. */
function respostaValida(v: ValorSpec | undefined): v is ValorSpec {
  if (!v) return false;
  if (v.origem === "sugerido" && v.confirmado !== true) return false;
  const texto = typeof v.valor === "string" ? v.valor.trim() : v.valor;
  return texto !== "" && texto !== undefined && texto !== null;
}

function linhaDoItem(
  numero: number,
  atividade: Atividade,
  respostas: Record<string, ValorSpec> | undefined
): string {
  const partes = [`${numero}. [${atividade.tipo}][${atividade.tamanho}] ${atividade.rotulo}`];
  if (atividade.descricao) partes.push(`   ${atividade.descricao}`);

  const meta: string[] = [];
  if (atividade.techs.length > 0) meta.push(`Techs: ${atividade.techs.join(", ")}`);
  if (atividade.contextos.length > 0) meta.push(`Contextos: ${atividade.contextos.join(", ")}`);
  if (meta.length > 0) partes.push(`   ${meta.join(" | ")}`);

  // Dependência entra pelo NÚMERO do item, não pela chave interna: a chave
  // (`n3::ep0`) não significa nada para quem lê o prompt, nem para o modelo.
  const deps = atividade.dependencias.filter((d) => d.alvoChave || d.detalhe);
  if (deps.length > 0) {
    partes.push(`   Depende de: ${deps.map((d) => d.alvoChave ?? d.detalhe).join(", ")} (${deps[0].type})`);
  }

  const jaEscrito = Object.entries(respostas ?? {}).filter(([, v]) => respostaValida(v));
  if (jaEscrito.length > 0) {
    partes.push("   Já definido (não reescrever, só complementar):");
    for (const [chave, valor] of jaEscrito) {
      // Uma linha só por campo: o prompt já é grande, e texto longo aqui
      // empurraria os itens seguintes para fora da janela do modelo.
      const texto = String(valor.valor).replace(/\s+/g, " ").trim();
      partes.push(`      • ${chave}: ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
    }
  }

  return partes.join("\n");
}

/** Substitui as dependências pelo número de exibição do item alvo. */
function comNumerosDeDependencia(linha: string, numeroPorChave: Map<string, number>): string {
  return linha.replace(/Depende de: ([^(]+)/, (todo, alvos: string) => {
    const traduzidos = alvos
      .split(",")
      .map((a) => a.trim())
      .map((a) => {
        const n = numeroPorChave.get(a);
        return n ? `item ${n}` : a;
      })
      .join(", ");
    return `Depende de: ${traduzidos} `;
  });
}

/**
 * Monta o prompt único da quebra inteira. Função pura: nenhuma chamada de
 * modelo acontece aqui — o resultado é texto para a pessoa copiar (ou, com
 * provedor conectado, mandar numa chamada só).
 */
export function gerarPromptUnico(
  atividades: Atividade[],
  diagrama: Diagrama,
  opcoes: OpcoesPromptUnico = {}
): string {
  const template = opcoes.template ?? TEMPLATE_PROMPT_UNICO_PADRAO;

  // Techs e contextos são o CONJUNTO de tudo que aparece na quebra — é assim
  // que o refinamento agregado faz sentido num prompt só (por item ele já
  // existe, e é o caminho da esteira).
  const techs = [...new Set(atividades.flatMap((a) => a.techs))].sort();
  const contextos = [...new Set(atividades.flatMap((a) => a.contextos))].sort();

  const numeroPorChave = new Map(atividades.map((a, i) => [a.chave, i + 1]));
  const itens = atividades
    .map((a, i) => comNumerosDeDependencia(linhaDoItem(i + 1, a, opcoes.respostasItens?.[a.chave]), numeroPorChave))
    .join("\n\n");

  const requisitos = opcoes.regras
    ? gerarChecklistTecnico(opcoes.regras, techs, contextos, diagrama.nodes, diagrama.edges)
    : "";
  const ciclos = opcoes.regras ? gerarCiclosDeTeste(opcoes.regras, techs, contextos) : "";

  const valores: Record<(typeof VARIAVEIS_PROMPT_UNICO)[number], string> = {
    descricaoEpico: opcoes.demandInfo?.trim() || SEM_DEMANDA,
    contextoAdicional: opcoes.contextoAdicional?.trim() || SEM_CONTEXTO,
    itensBreakDownContent: itens || "[Nenhum item derivado — desenhe o diagrama primeiro]",
    requisitosTecnicos: requisitos.trim() || SEM_REQUISITOS,
    ciclosTeste: ciclos.trim() || SEM_CICLOS,
    tecnologiasEnvolvidas: techs.join(", ") || "[nenhuma]",
    contextosAplicaveis: contextos.join(", ") || "[nenhum]",
    timestamp: (opcoes.agora ?? new Date()).toLocaleString("pt-BR"),
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (todo, nome: string) =>
    // Variável desconhecida fica LITERAL de propósito: sumir com ela
    // esconderia o erro de quem editou o template. `validarTemplatePromptUnico`
    // é quem avisa, na hora da edição.
    nome in valores ? valores[nome as keyof typeof valores] : todo
  );
}
