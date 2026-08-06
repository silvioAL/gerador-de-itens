import type { AppConfig, Condicao, DiagramaConfig, ErroValidacaoConfig, RegrasConfig } from "./types.js";

const TEMPLATE_RE = /\{\{(\w+)\}\}/g;

function extrairReferenciasTemplate(texto: string): string[] {
  return [...texto.matchAll(TEMPLATE_RE)].map((m) => m[1]);
}

function validarCondicao(
  condicao: unknown,
  caminho: string,
  chavesValidas: Set<string>,
  erros: ErroValidacaoConfig[]
): void {
  if (!condicao || typeof condicao !== "object") {
    erros.push({ campo: caminho, mensagem: "condição malformada (esperava um objeto)" });
    return;
  }
  const c = condicao as Record<string, unknown>;

  if ("field" in c && ("equals" in c || "notEquals" in c || "preenchido" in c)) {
    const campoRef = c.field as string;
    if (!chavesValidas.has(campoRef)) {
      erros.push({
        campo: caminho,
        mensagem: `when.field referencia "${campoRef}", que não existe no spec deste tipo de nó`,
      });
    }
    return;
  }
  if ("hasIncomingEdge" in c || "hasOutgoingEdge" in c || "nodeStatus" in c) return;
  if ("allOf" in c && Array.isArray(c.allOf)) {
    (c.allOf as Condicao[]).forEach((sub, i) =>
      validarCondicao(sub, `${caminho}.allOf[${i}]`, chavesValidas, erros)
    );
    return;
  }
  if ("anyOf" in c && Array.isArray(c.anyOf)) {
    (c.anyOf as Condicao[]).forEach((sub, i) =>
      validarCondicao(sub, `${caminho}.anyOf[${i}]`, chavesValidas, erros)
    );
    return;
  }
  if ("not" in c) {
    validarCondicao(c.not, `${caminho}.not`, chavesValidas, erros);
    return;
  }
  erros.push({
    campo: caminho,
    mensagem: `operador de condição desconhecido: ${JSON.stringify(condicao)}`,
  });
}

/**
 * Falha alto é o ponto (SPEC-01 §7.2): renomear uma tech sem atualizar app.json
 * deve impedir a subida com uma mensagem apontando o campo exato, não fazer o
 * requisito sumir em silêncio na derivação.
 */
export function validateConfig(diagrama: DiagramaConfig, app: AppConfig): ErroValidacaoConfig[] {
  const erros: ErroValidacaoConfig[] = [];
  const tiposDeNo = Object.keys(diagrama.nodeTypes);

  for (const [tipo, cfg] of Object.entries(diagrama.nodeTypes)) {
    for (const tech of cfg.techs) {
      if (!app.techs.includes(tech)) {
        erros.push({
          campo: `nodeTypes.${tipo}.techs`,
          mensagem: `tech "${tech}" não existe em app.json`,
        });
      }
    }
    for (const contexto of cfg.contextos) {
      if (!app.contextos.includes(contexto)) {
        erros.push({
          campo: `nodeTypes.${tipo}.contextos`,
          mensagem: `contexto "${contexto}" não existe em app.json`,
        });
      }
    }

    const chavesDoTipo = new Set(cfg.spec.map((f) => f.key));
    for (const campo of cfg.spec) {
      if (campo.when) {
        validarCondicao(campo.when, `nodeTypes.${tipo}.spec.${campo.key}.when`, chavesDoTipo, erros);
      }
      if (typeof campo.default === "string") {
        for (const ref of extrairReferenciasTemplate(campo.default)) {
          if (!chavesDoTipo.has(ref)) {
            erros.push({
              campo: `nodeTypes.${tipo}.spec.${campo.key}.default`,
              mensagem: `default referencia "{{${ref}}}", que não existe no spec de "${tipo}"`,
            });
          }
        }
      }
    }
  }

  for (const [tipoDestino, regra] of Object.entries(diagrama.edgeRules)) {
    if (tipoDestino !== "_fallback" && !tiposDeNo.includes(tipoDestino)) {
      erros.push({
        campo: `edgeRules.${tipoDestino}`,
        mensagem: `edgeRules referencia o tipo de nó "${tipoDestino}", que não existe em nodeTypes`,
      });
    }
    for (const edgeType of regra.valid) {
      if (!diagrama.edgeTypes[edgeType]) {
        erros.push({
          campo: `edgeRules.${tipoDestino}.valid`,
          mensagem: `tipo de aresta "${edgeType}" não existe em edgeTypes`,
        });
      }
    }
    if (regra.default && !regra.valid.includes(regra.default)) {
      erros.push({
        campo: `edgeRules.${tipoDestino}.default`,
        mensagem: `default "${regra.default}" não está entre os valid de "${tipoDestino}"`,
      });
    }
  }

  return erros;
}

/** Mesmo princípio de `validateConfig`: tech/contexto de `regras.json` que não existe em `app.json` falha alto. */
export function validateRegras(regras: RegrasConfig, app: AppConfig): ErroValidacaoConfig[] {
  const erros: ErroValidacaoConfig[] = [];

  for (const [tech, porTech] of Object.entries(regras.porTech)) {
    if (!app.techs.includes(tech)) {
      erros.push({ campo: `porTech.${tech}`, mensagem: `tech "${tech}" não existe em app.json` });
    }
    for (const [i, req] of porTech.requisitos.entries()) {
      for (const contexto of req.contextos) {
        if (!app.contextos.some((c) => c.includes(contexto) || c.toLowerCase().includes(contexto.toLowerCase()))) {
          erros.push({
            campo: `porTech.${tech}.requisitos[${i}].contextos`,
            mensagem: `contexto "${contexto}" não bate com nenhum contexto de app.json`,
          });
        }
      }
    }
    for (const [i, teste] of porTech.testes.entries()) {
      for (const contexto of teste.contextos) {
        if (!app.contextos.some((c) => c.includes(contexto) || c.toLowerCase().includes(contexto.toLowerCase()))) {
          erros.push({
            campo: `porTech.${tech}.testes[${i}].contextos`,
            mensagem: `contexto "${contexto}" não bate com nenhum contexto de app.json`,
          });
        }
      }
    }
  }

  return erros;
}
