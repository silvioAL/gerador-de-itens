import type { CampoDoConector, TipoDeCampoDoConector } from "../config/conectores.js";
import type { Fluxo, NoDoFluxo } from "../config/fluxos.js";

/**
 * SPEC-107 fatia F — **a compatibilidade de MAPEAMENTO por tipo: aviso,
 * não bloqueio.**
 *
 * Com a forma declarada nos dois lados da aresta, dá para dizer em voz alta
 * quando alguém liga uma `lista` numa entrada `numero` (§2.4-6). AVISO de
 * propósito: bloquear cedo ensina a ignorar a cor (§230), e há ligações
 * legítimas que o tipo não captura — quem fia decide, sabendo.
 *
 * `texto` e `documento` são compatíveis entre si nos DOIS sentidos:
 * `documento` afirma semântica de markdown, não muda o envelope (fatia F).
 * Lado sem contrato declarado (agente, campo desconhecido) não avisa nada —
 * ausência de forma não é incompatibilidade.
 */

export interface ContratoDoNoNoFluxo {
  entrada?: CampoDoConector[];
  saida?: CampoDoConector[];
}

const PARES_COMPATIVEIS: [TipoDeCampoDoConector, TipoDeCampoDoConector][] = [
  ["texto", "documento"],
  ["documento", "texto"],
];

function compativeis(deTipo: TipoDeCampoDoConector, paraTipo: TipoDeCampoDoConector): boolean {
  if (deTipo === paraTipo) return true;
  return PARES_COMPATIVEIS.some(([a, b]) => a === deTipo && b === paraTipo);
}

export interface AvisoDeMapeamento {
  de: string;
  para: string;
  saida: string;
  entrada: string;
  texto: string;
}

export function avisosDeMapeamento(
  fluxo: Fluxo,
  contratoDe: (no: NoDoFluxo) => ContratoDoNoNoFluxo | null
): AvisoDeMapeamento[] {
  const porId = new Map(fluxo.nos.map((no) => [no.id, no]));
  const avisos: AvisoDeMapeamento[] = [];
  for (const aresta of fluxo.arestas) {
    const origem = porId.get(aresta.de);
    const destino = porId.get(aresta.para);
    if (!origem || !destino) continue;
    const saidas = contratoDe(origem)?.saida;
    const entradas = contratoDe(destino)?.entrada;
    for (const par of aresta.mapeamento) {
      const tipoSaida = saidas?.find((c) => c.chave === par.saida)?.tipo;
      const tipoEntrada = entradas?.find((c) => c.chave === par.entrada)?.tipo;
      if (!tipoSaida || !tipoEntrada || compativeis(tipoSaida, tipoEntrada)) continue;
      avisos.push({
        de: aresta.de,
        para: aresta.para,
        saida: par.saida,
        entrada: par.entrada,
        texto: `"${par.saida}" (${tipoSaida}) → "${par.entrada}" (${tipoEntrada}) — os tipos declarados não combinam`,
      });
    }
  }
  return avisos;
}
