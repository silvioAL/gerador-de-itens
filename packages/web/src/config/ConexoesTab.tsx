import { useEffect, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import { apiConexoes, type ConexoesConfig } from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";

/**
 * SPEC-102 fatia D — **o vocabulário de conexão, editável.**
 *
 * ## Por que esta aba precisou existir
 *
 * O relato veio com print: ligar um Fluxo Decisão (FICO) num Motor de Regras
 * fazia nascer uma aresta **HTTP**, porque `edgeRules.motor.default` dizia isso
 * — e uma invocação dentro do motor não atravessa a rede. A única correção
 * possível era editar `config/diagrama.json` e reconstruir a imagem.
 *
 * O assistente também propõe esta mudança (alvo `regra-de-conexao`), e é o
 * caminho que o pedido original descreveu. Mas o `ConfigurarPanel` é declarado
 * como *"um jeito novo de chegar ao caminho velho"* — se o caminho velho não
 * existisse, esta seria a primeira configuração do produto que só se muda
 * conversando com um LLM. Daí a aba.
 *
 * ## Por que não tem escopo de time
 *
 * SPEC-102 §5.3: *"esta chamada não atravessa a rede"* é fato da arquitetura,
 * não preferência de time. Dois times discordando fariam o MESMO desenho
 * produzir itens diferentes — o determinismo que a SPEC-101 §4 usou para
 * recusar regra por time do nó. A aba diz isso em voz alta, porque uma tela de
 * Configurações que não menciona escopo é lida como "do meu time".
 *
 * ## O que ela grava
 *
 * Só as SOBREPOSIÇÕES. O `diagrama.json` continua sendo a base, e o destino que
 * ninguém tocou continua vindo dele — é o que faz uma correção de default numa
 * versão nova chegar a quem não sobrescreveu.
 */
export function ConexoesTab({ config }: { config: DiagramaConfig }) {
  const permissoes = usePermissoes({ hospedado: true });
  const podeEditar = permissoes.pode("conexoes", "editar");

  const [documento, setDocumento] = useState<ConexoesConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tipoNo, setTipoNo] = useState<string>("");

  useEffect(() => {
    apiConexoes
      .obter()
      .then((d) => setDocumento({ regras: d?.regras ?? {} }))
      .catch(() => setDocumento({ regras: {} }));
  }, []);

  const tiposDeNo = Object.entries(config.nodeTypes).map(([id, cfg]) => ({ id, rotulo: cfg.label ?? id }));
  const tiposDeAresta = Object.keys(config.edgeTypes ?? {});
  const alvo = tipoNo || tiposDeNo[0]?.id || "";

  // O que vale HOJE para esse destino — já é o resolvido (arquivo + o que a
  // organização sobrescreveu), porque `config` vem de `GET /config/diagrama`.
  const emVigor = config.edgeRules?.[alvo];
  const sobrescrito = !!documento?.regras?.[alvo];

  async function salvar(regra: { default: string; valid: string[] } | null) {
    if (!documento) return;
    setSalvando(true);
    setErro(null);
    try {
      const regras = { ...documento.regras };
      // `null` = voltar ao arquivo. Gravar a regra de fábrica como sobreposição
      // congelaria o destino: correção de default numa versão nova não chegaria.
      if (regra) regras[alvo] = regra;
      else delete regras[alvo];
      await apiConexoes.salvar({ regras });
      setDocumento({ regras });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!documento) return <div style={{ color: "var(--texto-mudo)" }}>carregando…</div>;

  return (
    <div data-testid="conexoes-tab">
      <p style={{ color: "var(--texto-2)", fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
        Qual conexão nasce quando alguém liga um componente em outro. A regra é do <strong>destino</strong>: é ele
        que define o que a ligação é.
      </p>
      <p style={{ color: "var(--texto-mudo)", fontSize: 12, lineHeight: 1.6 }}>
        Vale para a <strong>organização inteira</strong>, não por time — “esta chamada não atravessa a rede” é um fato
        da arquitetura, e dois times discordando fariam o mesmo desenho gerar itens diferentes.
      </p>

      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Destino
        <select
          value={alvo}
          onChange={(e) => setTipoNo(e.target.value)}
          style={{ display: "block", marginTop: 4, minWidth: 260 }}
          aria-label="Tipo de componente de destino"
        >
          {tiposDeNo.map((t) => (
            <option key={t.id} value={t.id}>
              {t.rotulo} ({t.id})
            </option>
          ))}
        </select>
      </label>

      {emVigor ? (
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
          <div>
            nasce como <strong data-testid="conexao-default">{emVigor.default ?? "—"}</strong>
            {sobrescrito && (
              <span style={{ color: "var(--acento)", fontSize: 11, marginLeft: 6 }}>sobrescrito pela organização</span>
            )}
          </div>
          <div style={{ color: "var(--texto-2)", fontSize: 12 }}>aceitos: {emVigor.valid.join(", ") || "—"}</div>

          <fieldset disabled={!podeEditar || salvando} style={{ border: 0, padding: 0, marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>
              Passar a nascer como
              <select
                defaultValue={emVigor.default ?? ""}
                onChange={(e) => void salvar({ default: e.target.value, valid: emVigor.valid })}
                style={{ display: "block", marginTop: 4, minWidth: 260 }}
                aria-label="Tipo de conexão padrão"
              >
                {/* Só os ACEITOS: um padrão fora deles é uma conexão que a
                    validação recusa, e oferecer isso seria oferecer o erro. */}
                {emVigor.valid.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {sobrescrito && (
              <button onClick={() => void salvar(null)} style={{ marginTop: 10 }}>
                Voltar ao padrão da versão
              </button>
            )}
          </fieldset>

          {!podeEditar && (
            <div style={{ color: "var(--texto-mudo)", fontSize: 11.5, marginTop: 8 }}>
              Você não tem permissão para editar “conexoes”.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12, color: "var(--texto-mudo)", fontSize: 13 }}>
          Este destino não tem regra declarada — ao ligar algo nele, vale o padrão geral.
          {tiposDeAresta.length === 0 && " (nenhum tipo de conexão configurado)"}
        </div>
      )}

      {erro && (
        <div style={{ color: "var(--vermelho)", fontSize: 12, marginTop: 8 }} role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}
