import { useEffect, useState } from "react";
import { apiAcessos, type NivelTime, type PermissoesMinhas } from "../api/client";

/**
 * SPEC-28 Fase 2 — o que ESTA pessoa pode, para a tela esconder o resto.
 *
 * Esconder é conveniência; a negação de verdade acontece em cada rota do
 * servidor (Fase 1b). Essa ordem importa para entender as duas decisões abaixo,
 * que parecem descuido e não são:
 *
 * 1. **Falha ABERTA.** Se `/permissoes/minhas` não responde, ou o modo é local
 *    (sem servidor, sem RBAC), o hook devolve "pode tudo". Falhar fechado
 *    esconderia funcionalidade de quem TEM permissão por causa de um soluço de
 *    rede — e como o servidor continua negando o que deve, o pior caso de
 *    falhar aberto é ver um botão que devolve 403. É o comportamento de hoje.
 *
 * 2. **Modo aberto continua abrindo.** `rbacAtivo: false` (organização sem
 *    papel nenhum) significa que ninguém configurou controle de acesso; a tela
 *    não pode inventar um.
 *
 * 3. **O eixo de NÍVEL conta (§220).** Por várias versões o `pode()` olhava só
 *    o grant RBAC — metade da regra do servidor. O efeito, reproduzido contra
 *    o banco de verdade: um **owner** de time, no instante em que a organização
 *    ganhava o primeiro papel, via cadeado em TUDO que não fosse seu grant
 *    explícito — enquanto o servidor aceitava a escrita normalmente
 *    (`exigirPermissao`: owner sempre pode). `POST /campos-no` respondia 400 de
 *    validação, não 403. Ou seja: a tela trancava o que o servidor liberava, e
 *    a única saída visível era dar a si mesmo um grant por recurso.
 *
 *    A regra do servidor tem dois eixos, e agora os dois vivem aqui:
 *    - `exigirPermissao` — owner **sempre** pode escrever; quem não é owner
 *      precisa de grant explícito;
 *    - `exigirEdicaoCurada` — nos recursos sob curadoria (algum papel os
 *      carrega, `curados` abaixo), o grant manda **inclusive sobre owner**.
 */
export interface Permissoes {
  /** `false` enquanto a resposta não chegou. Quem desenha deve tratar como
   * "ainda não sei", não como "não pode". */
  carregando: boolean;
  /** `true` quando existe RBAC configurado. A tela usa isto para decidir se
   * vale mostrar qualquer explicação sobre permissão. */
  rbacAtivo: boolean;
  pode: (recurso: string, acao?: string) => boolean;
  /** SPEC-38 — o nível no time consultado (`null` = ainda não sei / falha
   * aberta). A UI só esconde escrita quando tem CERTEZA que é `visualizar`. */
  nivel: NivelTime | null;
}

export function usePermissoes(opcoes: { hospedado: boolean; timeId?: string }): Permissoes {
  const { hospedado, timeId } = opcoes;
  const [dados, setDados] = useState<PermissoesMinhas | null>(null);
  const [carregando, setCarregando] = useState(hospedado);

  useEffect(() => {
    if (!hospedado) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    apiAcessos
      .minhas(timeId)
      .then((r) => {
        if (!cancelado) setDados(r);
      })
      .catch(() => {
        // Falha aberta — ver o comentário do topo.
        if (!cancelado) setDados(null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [hospedado, timeId]);

  const rbacAtivo = dados?.rbacAtivo === true;
  const nivel = (dados?.nivel as NivelTime | undefined) ?? null;

  return {
    carregando,
    rbacAtivo,
    pode: (recurso, acao = "editar") => {
      if (!hospedado || !rbacAtivo) return true;
      if (dados?.porRecurso?.[recurso]?.includes(acao) === true) return true;
      // Eixo de nível (§220): só vale para ESCRITA e só fora da curadoria —
      // é exatamente o recorte do `exigirPermissao`/`exigirEdicaoCurada`.
      // `curados` ausente (servidor antigo) fecha este eixo em vez de chutar:
      // abrir demais aqui mostraria botão que devolve 403 num recurso curado.
      if (acao !== "editar" || nivel !== "owner") return false;
      return dados?.curados?.includes(recurso) === false;
    },
    nivel,
  };
}

/**
 * Aba da ConfigScreen → recurso do RBAC.
 *
 * `regras` fica de fora porque é a exceção que a Fase 1b já enfrentou no
 * servidor: uma tela, QUATRO recursos. Quem decide se ela aparece é
 * `RECURSOS_DE_REGRAS` abaixo, e as seções internas são filtradas uma a uma —
 * esconder a aba inteira tiraria o checklist de processo de quem cuida só dele,
 * que é exatamente a delegação que a feature existe para permitir.
 *
 * `modeloIa` mapeia em `credenciais-ia` e não em `modelo-ia`: no modo hospedado
 * a escolha do modelo viaja junto com a credencial, e é essa a permissão que a
 * rota exige de fato (ver RECURSOS_SEM_ROTA no servidor).
 */
export const RECURSO_DA_ABA: Record<string, string> = {
  produtos: "produtos",
  perfis: "perfis-stack",
  campos: "campos-no",
  camposAresta: "campos-aresta",
  membros: "membros",
  acessos: "acessos",
  especificacao: "especificacao-template",
  pipeline: "pipeline-agentes",
  modeloIa: "credenciais-ia",
  /** SPEC-105 fatia A — o catálogo de conectores tem recurso próprio. */
  conectores: "conectores",
};

/** Sub-aba de `RegrasTab` → recurso. Espelha `SECOES_DE_REGRAS` do servidor. */
export const RECURSO_DA_SECAO_DE_REGRAS: Record<string, string> = {
  tecnico: "regras.checklistTecnico",
  processo: "regras.checklistProcesso",
  testes: "regras.testes",
  volumetria: "regras.volumetria",
  // SPEC-63 — a régua sobre a forma do desenho tem dono próprio.
  forma: "regras.topologia",
};
