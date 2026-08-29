import { useState } from "react";
import { ListaDeTimes } from "../auth/ListaDeTimes";
import type { AreaConfig } from "./rota";

/**
 * SPEC-40 Fase 1 — o menu (☰): navegação SECUNDÁRIA agrupada por intenção.
 * O fluxo primário (desenhar → derivar → revisar) nunca entra aqui; o menu é
 * a lista do que se ADMINISTRA. O filtro por perfil (cadeados, "pedir
 * ajuste") é a Fase 2 — a estrutura de grupos já nasce pronta pra ele.
 */
export interface MenuLateralProps {
  aberto: boolean;
  onFechar: () => void;
  timeAtivo: string;
  timeIds: string[];
  email: string;
  onTrocarTime: (timeId: string) => void;
  onNavegar: (area: AreaConfig) => void;
  /**
   * O que a pessoa edita. Área fora disso **não aparece** no menu.
   *
   * §221 mudou o mecanismo, não o propósito. A SPEC-51 tinha resolvido isto
   * com cadeado — o item continuava lá, clicável, e a tela de destino
   * explicava a ausência de permissão e oferecia "pedir ajuste". Virou
   * ocultação a pedido do usuário: menu é lista do que se administra, e listar
   * o que não se administra é ruído em toda abertura para ganhar um caminho
   * usado raramente.
   *
   * O pedido de ajuste **não morreu junto**: as áreas são deep-linkáveis
   * (`#/config/pipeline`, ver `rota.ts`), então quem chega por link continua
   * caindo na tela de "sem permissão" com o pedido ali — e a condução do PDCA
   * oferece "pedir ajuste" a quem não é owner (App.tsx). O que sumiu foi a
   * DESCOBERTA pelo menu.
   */
  podeEditarArea?: (area: AreaConfig) => boolean;
  onNovaQuebra: () => void;
  onAbrirQuebras: () => void;
  /**
   * SPEC-58 — o documento de desenho da demanda aberta.
   *
   * SPEC-61 — e ele é a saída ÚNICA: "Itens escritos" saiu do menu, porque os
   * itens viraram uma seção deste documento. Duas entradas para a mesma
   * derivação faziam o menu parecer maior do que o produto.
   */
  onDocumento: () => void;
  /** SPEC-84 fatia A — a spec da demanda, para quem (ou o que) implementa. */
  onSpec: () => void;
  /** SPEC-59 — como a FERRAMENTA está montada. Não é da demanda, então não
   * entra no grupo dela: é o mapa do que as telas de configuração configuram. */
  onSistema: () => void;
  onSair: () => void;
}

const GRUPOS: { titulo: string; itens: { area: AreaConfig; rotulo: string }[] }[] = [
  {
    // SPEC-53 — grupo próprio, e não um item dentro de "Padrões do time":
    // produto não é do time (um time atende vários, um produto atravessa
    // times). Pendurá-lo ali repetiria a mistura que a SPEC-42 desfez entre
    // time e stack.
    titulo: "Produto",
    itens: [{ area: "produtos", rotulo: "Contexto do produto" }],
  },
  {
    titulo: "Padrões do time",
    itens: [
      { area: "perfis", rotulo: "Stacks conhecidas" },
      { area: "campos", rotulo: "Padrões por componente" },
      { area: "camposAresta", rotulo: "Campos por tipo de conexão" },
      { area: "regras", rotulo: "Regras de refinamento" },
      // SPEC-79 — a aba existia e não tinha porta: dava para chegar por URL e
      // não pelo menu, que é como ninguém descobre um recurso.
      { area: "tokens", rotulo: "Design system" },
      { area: "especificacao", rotulo: "Especificação de solução" },
      { area: "exportacao", rotulo: "Exportação (tracker)" },
    ],
  },
  {
    titulo: "Pessoas & acesso",
    itens: [
      { area: "membros", rotulo: "Membros" },
      { area: "acessos", rotulo: "Acessos" },
    ],
  },
  {
    titulo: "IA",
    itens: [
      { area: "pipeline", rotulo: "Pipeline de IA" },
      { area: "modeloIa", rotulo: "Modelo de IA" },
      { area: "pdca", rotulo: "PDCA — melhoria contínua" },
    ],
  },
];

export function MenuLateral({
  aberto,
  onFechar,
  timeAtivo,
  timeIds,
  email,
  onTrocarTime,
  onNavegar,
  podeEditarArea,
  onNovaQuebra,
  onAbrirQuebras,
  onDocumento,
  onSpec,
  onSistema,
  onSair,
}: MenuLateralProps) {
  // §273 — fechado por padrão: trocar de time é raro, e a lista aberta o tempo
  // todo é o paredão de volta.
  const [trocandoTime, setTrocandoTime] = useState(false);

  if (!aberto) return null;

  const acao = (fn: () => void) => () => {
    fn();
    onFechar();
  };

  return (
    <>
      <div onClick={onFechar} style={fundoEstilo} aria-hidden="true" />
      <nav aria-label="Menu" data-testid="menu-lateral" style={menuEstilo}>
        <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Gerador de Itens</strong>
          <div style={{ flex: 1 }} />
          <button onClick={onFechar} aria-label="Fechar menu" style={fecharEstilo}>
            ×
          </button>
        </header>

        <p style={tituloGrupoEstilo}>Demanda</p>
        <button onClick={acao(onNovaQuebra)} style={itemEstilo}>
          Nova quebra
        </button>
        <button onClick={acao(onAbrirQuebras)} style={itemEstilo}>
          Abrir…
        </button>
        <button onClick={acao(onDocumento)} style={itemEstilo} data-testid="menu-documento">
          Documento de desenho
        </button>
        {/* Ao lado do documento, e não dentro dele: o documento é lido por
            quem decide, a spec por quem implementa. Mesma demanda, leitores
            diferentes. */}
        <button onClick={acao(onSpec)} style={itemEstilo} data-testid="menu-spec">
          Spec para construir
        </button>
        <p style={tituloGrupoEstilo}>A ferramenta</p>
        <button onClick={acao(onSistema)} style={itemEstilo} data-testid="menu-sistema">
          Como está montada
        </button>

        {/* §198 — "cenários" e "demonstração & tour" viraram dois botões
            fixos no header: são portas de EXPERIMENTAR, não de administrar. */}

        {GRUPOS.map((grupo) => {
          // §221 — área que a pessoa não edita SOME do menu, em vez de vir com
          // cadeado. Filtrar aqui e não dentro do `map` dos itens é o que evita
          // deixar o TÍTULO do grupo órfão quando ele fica sem nenhum item.
          const itens = grupo.itens.filter((item) => (podeEditarArea ? podeEditarArea(item.area) : true));
          if (itens.length === 0) return null;
          return (
            <div key={grupo.titulo}>
              <p style={tituloGrupoEstilo}>{grupo.titulo}</p>
              {itens.map((item) => (
                <button key={item.area} onClick={acao(() => onNavegar(item.area))} style={itemEstilo}>
                  {item.rotulo}
                </button>
              ))}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <div style={rodapeEstilo}>
          {/* §273 — o `<select>` saiu. Ele nascia legível com dois times e
              virava um paredão com sessenta (relato do usuário). O que fica é
              o INDICADOR do time ativo; a lista só aparece a pedido, e com
              busca quando o número justifica. */}
          <label style={{ fontSize: 11, color: "var(--texto-fraco)", display: "block", marginBottom: 4 }}>
            Time
          </label>
          <button
            aria-label="Time"
            data-testid="time-ativo"
            onClick={() => setTrocandoTime((t) => !t)}
            aria-expanded={trocandoTime}
            style={seletorTimeEstilo}
          >
            {timeAtivo}
            <span style={{ fontSize: 11, color: "var(--texto-mudo)", marginLeft: 6 }}>
              {timeIds.length > 1 ? "· trocar" : ""}
            </span>
          </button>
          {trocandoTime && timeIds.length > 1 && (
            <div style={{ marginTop: 6 }}>
              <ListaDeTimes
                timeIds={timeIds}
                ativo={timeAtivo}
                autoFocus
                onEscolher={(t) => {
                  setTrocandoTime(false);
                  onTrocarTime(t);
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--texto-mudo)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {email}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={acao(onSair)} style={{ ...itemEstilo, width: "auto", padding: "6px 12px" }}>
              Sair
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

const fundoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  zIndex: 69,
};

const menuEstilo: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: 300,
  maxWidth: "85vw",
  background: "var(--painel)",
  borderRight: "1px solid var(--borda-forte)",
  zIndex: 70,
  padding: "14px 14px 16px",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  boxShadow: "12px 0 40px rgba(0, 0, 0, 0.45)",
};

const tituloGrupoEstilo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--texto-fraco)",
  margin: "14px 4px 4px",
};

const itemEstilo: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  fontSize: 13,
  padding: "7px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};

const rodapeEstilo: React.CSSProperties = {
  borderTop: "1px solid var(--borda)",
  paddingTop: 12,
  marginTop: 12,
};

const seletorTimeEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const fecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};
