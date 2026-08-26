import type { AppConfig, Condicao, DiagramaConfig, ErroValidacaoConfig, FieldSpec, RegrasConfig } from "./types.js";
import { AGREGACOES_PERCURSO, OPERADORES_CHECAGEM, TIPOS_CAMPO } from "./types.js";

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

  /**
   * §237 — o `type` de cada campo, conferido em runtime.
   *
   * Sem isto um `"type": "lixo"` passava: o campo não renderizava, a prontidão
   * não o cobrava e nada apontava o erro — config incorreta falhando ABERTA e
   * em silêncio, que é o pior modo de falha possível e o que o §5 do
   * CONTEXTO ("falhar alto, nunca em silêncio") existe para impedir.
   *
   * Vale para o campo e para o `itemSpec` de uma lista: uma lista com item de
   * tipo inventado tem exatamente o mesmo sintoma, uma camada abaixo.
   */
  function validarTipoDeCampo(campo: FieldSpec, caminho: string) {
    if (!(TIPOS_CAMPO as readonly string[]).includes(campo.type)) {
      erros.push({
        campo: `${caminho}.type`,
        mensagem: `type "${campo.type}" não existe (válidos: ${TIPOS_CAMPO.join(", ")})`,
      });
    }
    for (const item of campo.itemSpec ?? []) {
      if (!(TIPOS_CAMPO as readonly string[]).includes(item.type)) {
        erros.push({
          campo: `${caminho}.itemSpec.${item.key}.type`,
          mensagem: `type "${item.type}" não existe (válidos: ${TIPOS_CAMPO.join(", ")})`,
        });
      }
    }
  }

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
      validarTipoDeCampo(campo, `nodeTypes.${tipo}.spec.${campo.key}`);
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

  for (const [tipo, cfg] of Object.entries(diagrama.edgeTypes)) {
    // `when` de campo de aresta não é validado aqui (mesma razão do `when` de
    // ItemProcesso, SPEC-20): os operadores de Condicao pressupõem um `No`
    // (nodeType, hasIncomingEdge...) — sem um `No` pra avaliar contra, ainda
    // não há semântica decidida pro `when` numa aresta (ver SPEC-21). Chave
    // referenciada em `default` continua validada normalmente.
    const chavesDoTipo = new Set((cfg.spec ?? []).map((f) => f.key));
    for (const campo of cfg.spec ?? []) {
      validarTipoDeCampo(campo, `edgeTypes.${tipo}.spec.${campo.key}`);
      if (typeof campo.default === "string") {
        for (const ref of extrairReferenciasTemplate(campo.default)) {
          if (!chavesDoTipo.has(ref)) {
            erros.push({
              campo: `edgeTypes.${tipo}.spec.${campo.key}.default`,
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

/**
 * Mesmo princípio de `validateConfig`: tech/contexto de `regras.json` que não
 * existe em `app.json` falha alto.
 *
 * SPEC-63 — `diagrama` é opcional porque só as réguas de FORMA precisam dele
 * (elas falam de tipos de nó e de conexão, que moram em `diagrama.json`).
 * Ausente, as outras validações rodam igual e as de forma se calam: validar
 * pela metade é melhor que exigir um argumento que a maioria dos chamadores não
 * tem por que conhecer.
 */
export function validateRegras(
  regras: RegrasConfig,
  app: AppConfig,
  diagrama?: DiagramaConfig
): ErroValidacaoConfig[] {
  const erros: ErroValidacaoConfig[] = [];

  for (const [tech, porTech] of Object.entries(regras.porTech)) {
    if (!app.techs.includes(tech)) {
      erros.push({ campo: `porTech.${tech}`, mensagem: `tech "${tech}" não existe em app.json` });
    }
    for (const [i, req] of porTech.checklistTecnico.entries()) {
      // §239 — a checagem é o que torna o requisito CONFERÍVEL, então config
      // mal escrita aqui não pode falhar em silêncio: uma regra com operador
      // inventado simplesmente nunca acusaria nada, e ninguém saberia que o
      // padrão declarado não está sendo conferido.
      const c = req.checagem;
      if (c) {
        const caminho = `porTech.${tech}.checklistTecnico[${i}].checagem`;
        if (!(OPERADORES_CHECAGEM as readonly string[]).includes(c.operador)) {
          erros.push({
            campo: `${caminho}.operador`,
            mensagem: `operador "${c.operador}" não existe (válidos: ${OPERADORES_CHECAGEM.join(", ")})`,
          });
        }
        // §241 — o alvo da comparação é literal OU outro campo, nunca os dois
        // nem nenhum. "Nenhum" nunca acusaria nada; "os dois" faria a regra
        // significar coisas diferentes conforme quem lê.
        if (c.operador !== "preenchido") {
          if (c.valor === undefined && !c.valorDe) {
            erros.push({
              campo: `${caminho}.valor`,
              mensagem: `operador "${c.operador}" precisa de "valor" ou de "valorDe" para comparar`,
            });
          }
          if (c.valor !== undefined && c.valorDe) {
            erros.push({
              campo: `${caminho}.valor`,
              mensagem: 'checagem tem "valor" e "valorDe" ao mesmo tempo — escolha um alvo de comparação',
            });
          }
        }
        if (c.multiplicadoPor && !c.valorDe) {
          erros.push({
            campo: `${caminho}.multiplicadoPor`,
            mensagem: '"multiplicadoPor" só faz sentido junto de "valorDe" — não há o que multiplicar',
          });
        }
        if (!c.campo?.trim()) {
          erros.push({ campo: `${caminho}.campo`, mensagem: "checagem sem campo — não há o que conferir" });
        }
      }
      for (const contexto of req.contextos) {
        if (!app.contextos.some((c) => c.includes(contexto) || c.toLowerCase().includes(contexto.toLowerCase()))) {
          erros.push({
            campo: `porTech.${tech}.checklistTecnico[${i}].contextos`,
            mensagem: `contexto "${contexto}" não bate com nenhum contexto de app.json`,
          });
        }
      }
    }
    // `when` do item de processo não é validado aqui: diferente de `FieldSpec.when`
    // (que vive dentro de um tipo de nó e tem as chaves do spec pra conferir), um
    // item de processo se aplica a vários tipos — não há um conjunto de chaves
    // único contra o qual validar `field`. Contexto continua validado.
    for (const [i, item] of (porTech.checklistProcesso ?? []).entries()) {
      for (const contexto of item.contextos) {
        if (!app.contextos.some((c) => c.includes(contexto) || c.toLowerCase().includes(contexto.toLowerCase()))) {
          erros.push({
            campo: `porTech.${tech}.checklistProcesso[${i}].contextos`,
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

  // SPEC-57 fatia E — a régua de PERCURSO. Mesma disciplina do §239: config
  // mal escrita aqui nunca acusaria nada, e ninguém saberia que o padrão
  // declarado não está sendo conferido.
  for (const [i, req] of (regras.percursos ?? []).entries()) {
    const caminho = `percursos[${i}].checagem`;
    const c = req.checagem;
    if (!(AGREGACOES_PERCURSO as readonly string[]).includes(c.agregacao)) {
      erros.push({
        campo: `${caminho}.agregacao`,
        mensagem: `agregação "${c.agregacao}" não existe (válidas: ${AGREGACOES_PERCURSO.join(", ")})`,
      });
    }
    if (!(OPERADORES_CHECAGEM as readonly string[]).includes(c.operador)) {
      erros.push({
        campo: `${caminho}.operador`,
        mensagem: `operador "${c.operador}" não existe (válidos: ${OPERADORES_CHECAGEM.join(", ")})`,
      });
    }
    // "preenchido" não significa nada sobre um agregado: a soma de um caminho
    // ou é um número ou não pôde ser apurada, e o segundo caso já tem lugar
    // próprio (`naoMedidos`).
    if (c.operador === "preenchido") {
      erros.push({
        campo: `${caminho}.operador`,
        mensagem: '"preenchido" não se aplica a percurso — compare o valor apurado com um número',
      });
    } else if (typeof c.valor !== "number") {
      erros.push({ campo: `${caminho}.valor`, mensagem: "checagem de percurso precisa de um `valor` numérico para comparar" });
    }
    // `saltos` conta nós; um campo ali seria lido por quem escreve como se
    // filtrasse a contagem, e não filtra.
    if (c.agregacao === "saltos" && c.campo) {
      erros.push({ campo: `${caminho}.campo`, mensagem: '"saltos" conta os nós do caminho e não usa `campo` — remova-o' });
    }
    if (c.agregacao !== "saltos" && !c.campo?.trim()) {
      erros.push({ campo: `${caminho}.campo`, mensagem: `agregação "${c.agregacao}" precisa de um \`campo\` para apurar` });
    }
  }

  /**
   * SPEC-63 §3.2 — a régua de FORMA. Mesma disciplina: regra que aponta para um
   * tipo que não existe não é regra frouxa, é regra que nunca dispara — e
   * descobrir isso por silêncio é o pior jeito.
   */
  const idsVistos = new Set<string>();
  for (const [i, req] of (regras.topologia ?? []).entries()) {
    const caminho = `topologia[${i}]`;
    if (!req.id?.trim()) {
      erros.push({ campo: `${caminho}.id`, mensagem: "regra de forma precisa de um `id` estável (a exceção aponta para ele)" });
    } else if (idsVistos.has(req.id)) {
      // Id repetido faria duas regras dividirem as mesmas exceções: aceitar
      // uma silenciaria a outra, e ninguém entenderia por quê.
      erros.push({ campo: `${caminho}.id`, mensagem: `id "${req.id}" está repetido em topologia` });
    } else {
      idsVistos.add(req.id);
    }

    if (!diagrama) continue;
    const c = req.checagem;
    const conferirNo = (tipo: string | undefined, campo: string) => {
      if (tipo && !diagrama.nodeTypes[tipo]) {
        erros.push({ campo: `${caminho}.checagem.${campo}`, mensagem: `tipo de componente "${tipo}" não existe em diagrama.json` });
      }
    };
    if (c.tipoAresta && !diagrama.edgeTypes[c.tipoAresta]) {
      erros.push({
        campo: `${caminho}.checagem.tipoAresta`,
        mensagem: `tipo de conexão "${c.tipoAresta}" não existe em diagrama.json`,
      });
    }
    if (c.tipo === "exige-conexao") {
      conferirNo(c.tipoNo, "tipoNo");
      conferirNo(c.tipoNoOposto, "tipoNoOposto");
    } else if (c.tipo === "limita-grau") {
      conferirNo(c.tipoNo, "tipoNo");
      // SPEC-67 — máximo negativo ou fracionário é régua que ninguém consegue
      // satisfazer nem entender. `0` é legítimo: "nenhuma chamada síncrona
      // saindo daqui" é um padrão real.
      if (!Number.isInteger(c.maximo) || c.maximo < 0) {
        erros.push({
          campo: `${caminho}.checagem.maximo`,
          mensagem: `máximo precisa ser um inteiro ≥ 0 (recebi ${JSON.stringify(c.maximo)})`,
        });
      }
    } else {
      conferirNo(c.deTipoNo, "deTipoNo");
      conferirNo(c.paraTipoNo, "paraTipoNo");
    }
  }

  return erros;
}
