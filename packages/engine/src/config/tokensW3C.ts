import type { Token } from "./types.js";

/**
 * SPEC-79 fatia A — **ler e escrever o formato que as ferramentas já falam.**
 *
 * ## Por que W3C, e por que não Figma
 *
 * A SPEC-79 §3 recusa importar de Figma automaticamente: é caro, depende de uma
 * integração que ninguém mediu, e acopla o produto a uma ferramenta. O formato
 * de *Design Tokens* do W3C é a saída — Figma, Style Dictionary, Tokens Studio e
 * companhia exportam nele, então **um import de JSON cobre o caso sem acoplar em
 * ferramenta nenhuma.**
 *
 * ## O formato, na parte que importa
 *
 * Grupos aninhados, e uma folha é qualquer objeto com `$value`:
 *
 * ```json
 * { "cor": { "fundo": { "painel": { "$value": "#ffffff", "$type": "color" } } } }
 * ```
 *
 * Isso vira `{ nome: "cor.fundo.painel", valor: "#ffffff", grupo: "cor" }`.
 *
 * ## O que NÃO é suportado, e está dito
 *
 * **Alias** (`"$value": "{cor.base.branco}"`) entra como o texto literal, sem
 * resolver. Resolver alias exige grafo com detecção de ciclo, e a fatia C não
 * precisa disso: uma cor que é alias simplesmente não é legível como cor, e a
 * checagem de contraste **se cala** — que é o comportamento certo, e não um
 * silêncio acidental. Resolver alias vira trabalho quando alguém trouxer um
 * arquivo real em que isso doa.
 *
 * **`$type` composto** (sombra, gradiente, tipografia como objeto) vira o JSON
 * do valor em texto. Não se perde nada; só não se mede nada sobre ele, e nenhum
 * operador da fatia C pretende medir.
 */

const CHAVES_RESERVADAS = new Set(["$value", "$type", "$description", "$extensions"]);

interface FolhaW3C {
  $value: unknown;
  $type?: string;
  $description?: string;
}

function ehFolha(v: unknown): v is FolhaW3C {
  return typeof v === "object" && v !== null && "$value" in v;
}

function textoDe(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  // Valor composto: guarda o JSON. Ver o cabeçalho — não se perde, só não se mede.
  return JSON.stringify(valor);
}

/**
 * `Token[]` a partir de um documento no formato do W3C.
 *
 * Tolerante de propósito: um arquivo exportado de ferramenta real vem com
 * metadados que não interessam aqui, e recusar o arquivo inteiro por causa de
 * uma chave desconhecida transformaria o import numa briga. O que não for folha
 * nem grupo é simplesmente ignorado.
 */
export function deTokensW3C(documento: unknown, modoEscuro?: unknown): Token[] {
  const claros = achatar(documento);
  if (modoEscuro === undefined) return claros;

  // Dois arquivos (claro e escuro) é como toda ferramenta exporta os dois modos.
  // Casar por NOME, e não por posição: a ordem das chaves de um JSON não é
  // contrato, e casar por posição perderia o par no primeiro token novo.
  const escuros = new Map(achatar(modoEscuro).map((t) => [t.nome, t.valor]));
  return claros.map((t) => {
    const escuro = escuros.get(t.nome);
    return escuro === undefined ? t : { ...t, valorEscuro: escuro };
  });
}

function achatar(documento: unknown, caminho: string[] = []): Token[] {
  if (typeof documento !== "object" || documento === null) return [];

  if (ehFolha(documento)) {
    return [
      {
        nome: caminho.join("."),
        valor: textoDe(documento.$value),
        grupo: caminho[0],
        ...(documento.$description ? { ajuda: documento.$description } : {}),
      },
    ];
  }

  const achados: Token[] = [];
  for (const [chave, valor] of Object.entries(documento)) {
    if (CHAVES_RESERVADAS.has(chave)) continue;
    achados.push(...achatar(valor, [...caminho, chave]));
  }
  return achados;
}

/**
 * O caminho de volta: `Token[]` → documento W3C.
 *
 * Existe para que o import não seja de mão única. Um time que ajustou os tokens
 * aqui precisa conseguir levá-los de volta para a ferramenta onde o design vive
 * — sem isso, esta tela vira mais um lugar onde a verdade se bifurca (§263).
 */
export function paraTokensW3C(tokens: Token[], modo: "claro" | "escuro" = "claro"): Record<string, unknown> {
  const raiz: Record<string, unknown> = {};

  for (const token of tokens) {
    const partes = token.nome.split(".").filter(Boolean);
    if (partes.length === 0) continue;

    let atual = raiz;
    for (const parte of partes.slice(0, -1)) {
      if (typeof atual[parte] !== "object" || atual[parte] === null) atual[parte] = {};
      atual = atual[parte] as Record<string, unknown>;
    }

    const folha: FolhaW3C = {
      $value: modo === "escuro" ? (token.valorEscuro ?? token.valor) : token.valor,
      ...(token.grupo === "cor" ? { $type: "color" } : {}),
      ...(token.ajuda ? { $description: token.ajuda } : {}),
    };
    atual[partes[partes.length - 1]] = folha;
  }

  return raiz;
}
