import { calcularProntidao, type Diagrama, type DiagramaConfig, type No, type NivelProntidao } from "@gerador/engine";

export interface NoComProntidao {
  no: No;
  nivel: NivelProntidao;
  /** Rótulos dos campos obrigatórios em aberto — não as chaves cruas, pra dar
   * pra mostrar direto na lista sem precisar clicar no nó pra descobrir o quê falta. */
  camposFaltando: string[];
}

export interface ResumoProntidao {
  vermelhos: NoComProntidao[];
  amarelos: NoComProntidao[];
  verdes: No[];
}

/** Fonte única do agrupamento por semáforo — usada no resumo global e no gate de derivação. */
export function calcularResumoProntidao(diagrama: Diagrama, config: DiagramaConfig): ResumoProntidao {
  const vermelhos: NoComProntidao[] = [];
  const amarelos: NoComProntidao[] = [];
  const verdes: No[] = [];

  for (const no of diagrama.nodes) {
    const cfg = config.nodeTypes[no.type];
    if (!cfg) {
      vermelhos.push({ no, nivel: "vermelho", camposFaltando: ["tipo de nó não existe na config carregada"] });
      continue;
    }
    const prontidao = calcularProntidao(cfg.spec, no, diagrama.edges);
    const camposFaltando = prontidao.obrigatoriosEmAberto.map(
      (chave) => cfg.spec.find((campo) => campo.key === chave)?.label ?? chave
    );
    if (prontidao.nivel === "vermelho") vermelhos.push({ no, nivel: "vermelho", camposFaltando });
    else if (prontidao.nivel === "amarelo") amarelos.push({ no, nivel: "amarelo", camposFaltando });
    else verdes.push(no);
  }

  return { vermelhos, amarelos, verdes };
}
