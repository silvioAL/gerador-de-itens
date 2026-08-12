# -*- coding: utf-8 -*-
# 1) useQuebra: responderItem aceita undefined = remover (Descartar da fila)
p='packages/web/src/state/useQuebra.ts'
s=open(p,encoding='utf-8').read()
a='''  const responderItem = useCallback((atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => {
    setQuebra((q) => ({
      ...q,
      respostasItens: {
        ...q.respostasItens,
        [atividadeChave]: { ...q.respostasItens?.[atividadeChave], [chavePlaceholder]: resposta },
      },
    }));
  }, []);'''
assert a in s
b='''  // SPEC-44: `undefined` REMOVE a resposta (o Descartar da fila guiada) — o
  // campo volta a "✍️ especificar" de verdade, não fica um valor vazio.
  const responderItem = useCallback((atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => {
    setQuebra((q) => {
      const doItem = { ...q.respostasItens?.[atividadeChave] };
      if (resposta === undefined) delete doItem[chavePlaceholder];
      else doItem[chavePlaceholder] = resposta;
      return { ...q, respostasItens: { ...q.respostasItens, [atividadeChave]: doItem } };
    });
  }, []);'''
s=s.replace(a,b)
open(p,'w',encoding='utf-8',newline='').write(s)
print('useQuebra ok')

# 2) ReviewScreen
p='packages/web/src/review/ReviewScreen.tsx'
s=open(p,encoding='utf-8').read()
subs=[]

# import
a='import { apiIa, apiPdca } from "../api/client";'
if a not in s:
    raise AssertionError('import apiIa')
subs.append((a, a+'\nimport { assinarSugestao, fraseDeCompletude, pendenciasDaRevisao, type PendenteDeConfirmacao } from "./pendencias";\nimport { FilaDeRevisao } from "./FilaDeRevisao";'))

# prop type
subs.append(('  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;',
 '''  /** SPEC-44: `undefined` remove a resposta (Descartar da fila guiada). */
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => void;
  /** SPEC-44 — deep-link da tela de itens: seleciona este item ao abrir. */
  itemInicial?: string | null;'''))

subs.append(('  onResponderItem,\n','  onResponderItem,\n  itemInicial,\n'))

# responderComProcedencia trata undefined
subs.append(('''  const responderComProcedencia = useCallback(
    (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => {
      onResponderItem?.(atividadeChave, chavePlaceholder, {
        ...resposta,
        baseadoEm: carimboDoItem(atividadeChave),
      });
    },
    [onResponderItem, carimboDoItem]
  );''',
 '''  const responderComProcedencia = useCallback(
    (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => {
      if (resposta === undefined) {
        onResponderItem?.(atividadeChave, chavePlaceholder, undefined);
        return;
      }
      onResponderItem?.(atividadeChave, chavePlaceholder, {
        ...resposta,
        baseadoEm: carimboDoItem(atividadeChave),
      });
    },
    [onResponderItem, carimboDoItem]
  );'''))

# pend + fila state + itemInicial effect — ancorado no cálculo de contagens
a='''  const contagens = regras
    ? resultado.atividades.reduce('''
assert a in s
subs.append((a,
 '''  // SPEC-44 — a régua única: sugestões aguardando assinatura x campos vazios,
  // agregadas sobre TODOS os itens (a barra, os chips e a fila leem daqui).
  const pend = regras
    ? pendenciasDaRevisao(
        resultado.atividades.map((a) => ({ chave: a.chave, rotulo: a.rotulo, ficha: fichas.get(a.chave)! }))
      )
    : null;
  const [filaAberta, setFilaAberta] = useState<PendenteDeConfirmacao[] | null>(null);

  function confirmarTodas() {
    for (const s of pend?.sugestoes ?? []) {
      responderComProcedencia(s.itemChave, s.chave, assinarSugestao(s.resposta));
    }
  }

  // Deep-link da tela de itens: chegar com um item alvo seleciona ele.
  useEffect(() => {
    if (itemInicial) setSelecionada(itemInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemInicial]);

''' + a))

# barra após </header>
a='      </header>\n'
assert s.count(a)>=1
subs.append((a,
 a + '''
      {/* SPEC-44 — a barra de pendências: o agregado que faltava. Aceitar é
          barato (1 clique global); intervir é que merece clique. Some quando
          não há pendência, e espera a esteira terminar (os números mudariam
          sob o usuário). */}
      {pend && !esteira.rodando && (pend.sugestoes.length > 0 || pend.vazios > 0) && (
        <div style={barraPendenciasEstilo} data-testid="barra-pendencias">
          <span style={{ fontSize: 12.5, color: "var(--texto-2)" }}>
            {pend.sugestoes.length > 0 &&
              `${pend.sugestoes.length} sugestão${pend.sugestoes.length === 1 ? "" : "s"} da esteira aguardando`}
            {pend.sugestoes.length > 0 && pend.vazios > 0 && " · "}
            {pend.vazios > 0 && `${pend.vazios} campo${pend.vazios === 1 ? "" : "s"} vazio${pend.vazios === 1 ? "" : "s"}`}
          </span>
          <div style={trilhoPendenciasEstilo} aria-hidden="true">
            <div style={{ ...barraProgressoPendenciasEstilo, width: `${pend.totais > 0 ? (pend.confirmados / pend.totais) * 100 : 0}%` }} />
          </div>
          {pend.sugestoes.length > 0 && (
            <>
              <button onClick={confirmarTodas} style={botaoBarraEstilo} data-testid="confirmar-todas">
                Confirmar todas ({pend.sugestoes.length})
              </button>
              <button onClick={() => setFilaAberta(pend.sugestoes)} style={botaoBarraSecEstilo} data-testid="revisar-uma-a-uma">
                Revisar uma a uma
              </button>
            </>
          )}
        </div>
      )}
''', ))

# chip de completude + confirmar item no card (após tipo · tamanho / dependências)
a='''                  <div style={{ fontSize: 11, color: "var(--dim, #8D9BB0)", marginTop: 3 }}>
                    {a.tipo} · {a.tamanho}
                    {a.dependencias.length > 0 && ` · depende de ${descreverDependencia(a)}`}
                  </div>'''
assert a in s
subs.append((a, a + '''
                  {/* SPEC-44 — a MESMA frase de completude da tela de itens,
                      e o lote por item: assinar tudo deste item num clique. */}
                  {(() => {
                    const doItem = pendenciasDaRevisao([{ chave: a.chave, rotulo: a.rotulo, ficha }]);
                    return (
                      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={chipCompletudeEstilo} data-testid={`completude-${a.chave}`}>
                          {fraseDeCompletude(doItem.sugestoes.length, doItem.vazios)}
                        </span>
                        {doItem.sugestoes.length > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            data-testid={`confirmar-item-${a.chave}`}
                            title={`Assina as ${doItem.sugestoes.length} sugestões deste item`}
                            style={confirmarItemEstilo}
                            onClick={(e) => {
                              e.stopPropagation();
                              for (const s of doItem.sugestoes) responderComProcedencia(s.itemChave, s.chave, assinarSugestao(s.resposta));
                            }}
                          >
                            ✓ confirmar item
                          </span>
                        )}
                      </div>
                    );
                  })()}'''))

# fila renderizada junto dos balões
a='      {momentoM7Ativo && ('
assert a in s
subs.append((a,
 '''      {filaAberta && (
        <FilaDeRevisao
          pendentes={filaAberta}
          onConfirmar={(itemChave, chave, resposta) => responderComProcedencia(itemChave, chave, resposta)}
          onDescartar={(itemChave, chave) => responderComProcedencia(itemChave, chave, undefined)}
          onFechar={() => setFilaAberta(null)}
        />
      )}
''' + a))

# confirmar seção no header do papel (AbaRefinamento)
a='''            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={lblEstilo}>{papelConfig.nome}</span>
              {onReRodarSeguintes &&'''
assert a in s
subs.append((a,
 '''            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={lblEstilo}>{papelConfig.nome}</span>
              {/* SPEC-44 — lote por seção: assinar tudo que o papel escreveu. */}
              {placeholders.some((p) => p.resposta !== undefined && !respostaConfirmada(p.resposta)) && (
                <button
                  onClick={() => {
                    for (const p of placeholders) {
                      if (p.resposta !== undefined && !respostaConfirmada(p.resposta)) {
                        onResponder?.(p.chave, { ...p.resposta, confirmado: true });
                      }
                    }
                  }}
                  style={reRodarEstilo}
                  data-testid={`confirmar-secao-${papelConfig.id}`}
                >
                  ✓ Confirmar seção
                </button>
              )}
              {onReRodarSeguintes &&'''))

for a,b in subs:
    assert a in s, a[:60]
    s=s.replace(a,b,1)

# estilos novos no fim do arquivo
s=s.rstrip()+'''

const barraPendenciasEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 16px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel-alto)",
};

const trilhoPendenciasEstilo: React.CSSProperties = {
  flex: 1,
  height: 5,
  borderRadius: 999,
  background: "var(--fundo)",
  overflow: "hidden",
  maxWidth: 220,
};

const barraProgressoPendenciasEstilo: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "var(--verde, #3ecf8e)",
  transition: "width 250ms ease",
};

const botaoBarraEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoBarraSecEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const chipCompletudeEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-fraco)",
  background: "var(--fundo)",
};

const confirmarItemEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "none",
  background: "rgba(62, 207, 142, 0.15)",
  color: "var(--verde, #3ecf8e)",
  cursor: "pointer",
};
'''
open(p,'w',encoding='utf-8',newline='').write(s)
print('review ok')

# 3) ItensScreen: chip clicável de volta pra revisão
p='packages/web/src/itens/ItensScreen.tsx'
s=open(p,encoding='utf-8').read()
a='''  /** Regenerar = voltar pra revisão, onde o material mora. */
  onIrParaRevisao?: () => void;'''
assert a in s
s=s.replace(a, a+'''
  /** SPEC-44 — deep-link: abre a revisão JÁ no item deste card. */
  onRevisarItem?: (chave: string) => void;''')
a='export function ItensScreen({ itens, tituloDaQuebra, onAbrirMenu, onFechar, onIrParaRevisao }: ItensScreenProps) {'
assert a in s
s=s.replace(a,'export function ItensScreen({ itens, tituloDaQuebra, onAbrirMenu, onFechar, onIrParaRevisao, onRevisarItem }: ItensScreenProps) {')
a='''                        <span
                          style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent" }}
                          data-testid={`item-completude-${i}`}
                        >
                          {completude.rotulo}
                        </span>'''
assert a in s
s=s.replace(a,'''                        {/* SPEC-44 — item não-pronto: o chip é o caminho de
                            VOLTA pra revisão daquele item, não um beco. */}
                        {onRevisarItem && (item.pendencias > 0 || item.sugestoes > 0) && item.estado !== "exportado" ? (
                          <button
                            onClick={() => onRevisarItem(item.chave)}
                            title="Abrir a revisão já neste item pra resolver as pendências"
                            style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent", cursor: "pointer" }}
                            data-testid={`item-completude-${i}`}
                          >
                            {completude.rotulo} ↩
                          </button>
                        ) : (
                          <span
                            style={{ ...chipEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent" }}
                            data-testid={`item-completude-${i}`}
                          >
                            {completude.rotulo}
                          </span>
                        )}''')
open(p,'w',encoding='utf-8',newline='').write(s)
print('itens ok')

# 4) App: itemInicial + onRevisarItem
p='packages/web/src/App.tsx'
s=open(p,encoding='utf-8').read()
a='  const [itensGerados, setItensGerados] = useState<ItemGerado[]>([]);'
assert a in s
s=s.replace(a, a+'''
  // SPEC-44 — deep-link da tela de itens pra revisão: o item a selecionar.
  const [itemInicialRevisao, setItemInicialRevisao] = useState<string | null>(null);''')
a='          onResponderItem={responderItem}'
assert a in s
s=s.replace(a,'          onResponderItem={responderItem}\n          itemInicial={itemInicialRevisao}')
a='''          onFechar={() => navegar({ tela: "canvas" })}
          onIrParaRevisao={() => navegar({ tela: "canvas" })}
        />'''
assert a in s
s=s.replace(a,'''          onFechar={() => navegar({ tela: "canvas" })}
          onIrParaRevisao={() => navegar({ tela: "canvas" })}
          onRevisarItem={
            resultado
              ? (chave) => {
                  setItemInicialRevisao(chave);
                  navegar({ tela: "canvas" });
                }
              : undefined
          }
        />''')
open(p,'w',encoding='utf-8',newline='').write(s)
print('app ok')
