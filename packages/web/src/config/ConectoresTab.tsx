import { useEffect, useState } from "react";
import {
  apiCatalogoDeConectores,
  apiConectores,
  type CampoDoConector,
  type Conector,
  type ConectorDoCatalogo,
} from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";

/**
 * SPEC-105 fatia A — o catálogo de conectores.
 *
 * Lista simples com a contagem no título (§9.6): construir busca para três
 * conectores é especulação; quando o número incomodar, ele terá aparecido com
 * nome.
 *
 * A lista mostra o catálogo EM VIGOR (declarados + derivados dos destinos do
 * gateway); o que se edita aqui são só os DECLARADOS — quem edita um destino
 * continua editando na aba de Exportação, e a mudança aparece aqui derivada.
 *
 * O "Executar" é a fatia B visível: chama `POST /conectores/:id/executar` e
 * mostra a saída MAPEADA. O cabeçalho (o segredo) nunca chega a esta tela.
 */

const CAMPO_VAZIO: CampoDoConector = { chave: "", rotulo: "", tipo: "texto" };

interface FormConector {
  id: string;
  nome: string;
  descricao: string;
  endpoint: string;
  metodo: "POST" | "PUT" | "PATCH";
  envelope: string;
  /** "Nome: valor", um por linha — a forma mais simples que não vira motor. */
  cabecalhosTexto: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
}

const FORM_VAZIO: FormConector = {
  id: "",
  nome: "",
  descricao: "",
  endpoint: "",
  metodo: "POST",
  envelope: "",
  cabecalhosTexto: "",
  entrada: [],
  saida: [],
};

function cabecalhosDoTexto(texto: string): Record<string, string> {
  const cabecalhos: Record<string, string> = {};
  for (const linha of texto.split("\n")) {
    const separador = linha.indexOf(":");
    if (separador <= 0) continue;
    const nome = linha.slice(0, separador).trim();
    const valor = linha.slice(separador + 1).trim();
    if (nome && valor) cabecalhos[nome] = valor;
  }
  return cabecalhos;
}

function textoDosCabecalhos(cabecalhos: Record<string, string>): string {
  return Object.entries(cabecalhos)
    .map(([nome, valor]) => `${nome}: ${valor}`)
    .join("\n");
}

function comoForm(conector: Conector): FormConector {
  return {
    id: conector.id,
    nome: conector.nome,
    descricao: conector.descricao ?? "",
    endpoint: conector.endpoint,
    metodo: conector.metodo,
    envelope: conector.envelope,
    cabecalhosTexto: textoDosCabecalhos(conector.cabecalhos),
    entrada: conector.entrada,
    saida: conector.saida,
  };
}

function comoConector(form: FormConector): Conector {
  return {
    id: form.id.trim(),
    nome: form.nome.trim() || form.id.trim(),
    ...(form.descricao.trim() ? { descricao: form.descricao.trim() } : {}),
    endpoint: form.endpoint.trim(),
    metodo: form.metodo,
    cabecalhos: cabecalhosDoTexto(form.cabecalhosTexto),
    envelope: form.envelope.trim(),
    entrada: form.entrada.filter((c) => c.chave.trim()),
    saida: form.saida.filter((c) => c.chave.trim()),
  };
}

export function ConectoresTab() {
  const permissoes = usePermissoes({ hospedado: true });
  const podeEditar = permissoes.pode("conectores", "editar");

  const [catalogo, setCatalogo] = useState<ConectorDoCatalogo[] | null>(null);
  const [declarados, setDeclarados] = useState<Conector[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** `null` = form fechado; `""` = criando; id = editando o declarado. */
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormConector>(FORM_VAZIO);

  async function carregar() {
    try {
      const [vigor, documento] = await Promise.all([apiCatalogoDeConectores.listar(), apiConectores.obter()]);
      setCatalogo(vigor.conectores);
      setDeclarados(documento?.conectores ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function salvar(novaLista: Conector[]) {
    setSalvando(true);
    setErro(null);
    try {
      await apiConectores.salvar({ conectores: novaLista });
      setEditando(null);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  function submeterForm() {
    const conector = comoConector(form);
    const semEle = declarados.filter((c) => c.id !== (editando || conector.id));
    void salvar([...semEle, conector]);
  }

  function remover(id: string) {
    void salvar(declarados.filter((c) => c.id !== id));
  }

  if (!catalogo) return <div data-testid="conectores-tab">carregando…</div>;

  return (
    <div data-testid="conectores-tab" style={{ maxWidth: 760 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Conectores ({catalogo.length} no catálogo)</h3>
      <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "0 0 14px" }}>
        Um conector é um endereço que a organização sabe chamar, com a forma declarada: o que mandar
        (entrada) e como ler o que volta (saída). Uma integração nova entra aqui — sem código, sem release.
        Os marcados como “do gateway” vêm dos destinos configurados na Exportação.
      </p>

      {erro && (
        <p data-testid="erro-conectores" style={{ fontSize: 12.5, color: "var(--vermelho)" }}>
          {erro}
        </p>
      )}

      <div data-testid="catalogo-de-conectores" style={{ display: "grid", gap: 10 }}>
        {catalogo.map((conector) => (
          <CartaoDeConector
            key={conector.id}
            conector={conector}
            podeEditar={podeEditar && conector.origem === "declarado"}
            onEditar={() => {
              const declarado = declarados.find((c) => c.id === conector.id);
              if (!declarado) return;
              setEditando(conector.id);
              setForm(comoForm(declarado));
            }}
            onRemover={() => remover(conector.id)}
          />
        ))}
        {catalogo.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>
            Nenhum conector ainda — cadastre o primeiro abaixo, ou configure um destino na aba de Exportação.
          </p>
        )}
      </div>

      {podeEditar && editando === null && (
        <button
          data-testid="adicionar-conector"
          onClick={() => {
            setEditando("");
            setForm(FORM_VAZIO);
          }}
          style={{ ...botao, marginTop: 14 }}
        >
          + Cadastrar conector
        </button>
      )}

      {editando !== null && (
        <fieldset
          disabled={salvando}
          data-testid="form-conector"
          style={{ marginTop: 14, border: "1px solid var(--borda-forte)", borderRadius: 10, padding: 14 }}
        >
          <legend style={{ fontSize: 13, fontWeight: 600 }}>
            {editando ? `Editando "${editando}"` : "Novo conector"}
          </legend>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <label style={rotulo}>
              Identificador
              <input
                value={form.id}
                disabled={!!editando}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="volumetria-do-projeto"
                style={campo}
              />
            </label>
            <label style={rotulo}>
              Nome
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Volumetria (Dynatrace)"
                style={campo}
              />
            </label>
            <label style={{ ...rotulo, gridColumn: "1 / -1" }}>
              Endereço (endpoint)
              <input
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://gateway.empresa/volumetria"
                style={campo}
              />
            </label>
            <label style={rotulo}>
              Método
              <select value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value as FormConector["metodo"] })} style={campo}>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label style={rotulo}>
              Envelope (vazio = corpo na raiz)
              <input
                value={form.envelope}
                onChange={(e) => setForm({ ...form, envelope: e.target.value })}
                placeholder="data"
                style={campo}
              />
            </label>
            <label style={{ ...rotulo, gridColumn: "1 / -1" }}>
              Cabeçalhos (um por linha, “Nome: valor”) — ficam no servidor, nunca voltam para esta tela
              <textarea
                value={form.cabecalhosTexto}
                onChange={(e) => setForm({ ...form, cabecalhosTexto: e.target.value })}
                rows={2}
                placeholder="Authorization: Bearer …"
                style={{ ...campo, resize: "vertical" }}
              />
            </label>
          </div>

          <EditorDeCampos
            titulo="Entrada — o que mandar"
            campos={form.entrada}
            comCaminho={false}
            onMudar={(entrada) => setForm({ ...form, entrada })}
          />
          <EditorDeCampos
            titulo="Saída — como ler o que volta"
            campos={form.saida}
            comCaminho
            onMudar={(saida) => setForm({ ...form, saida })}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              data-testid="salvar-conector"
              onClick={submeterForm}
              disabled={!form.id.trim() || !form.endpoint.trim()}
              style={botaoPrimario}
            >
              Salvar conector
            </button>
            <button
              onClick={() => {
                setEditando(null);
                setForm(FORM_VAZIO);
              }}
              style={botao}
            >
              Cancelar
            </button>
          </div>
        </fieldset>
      )}

      {!podeEditar && (
        <p style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 12 }}>
          O catálogo é curado pela organização — cadastrar e editar conector é de quem tem a permissão
          “conectores”.
        </p>
      )}
    </div>
  );
}

function CartaoDeConector({
  conector,
  podeEditar,
  onEditar,
  onRemover,
}: {
  conector: ConectorDoCatalogo;
  podeEditar: boolean;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const [executarAberto, setExecutarAberto] = useState(false);

  return (
    <div
      data-testid={`conector-${conector.id}`}
      style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "10px 12px", background: "var(--painel-alto)" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5 }}>{conector.nome}</strong>
        <code style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>{conector.id}</code>
        <span style={selo}>{conector.origem === "fabrica" ? "do gateway" : "cadastrado"}</span>
        {conector.temCabecalhos && <span style={selo}>com credencial no servidor</span>}
        <div style={{ flex: 1 }} />
        {podeEditar && (
          <>
            <button onClick={onEditar} style={botaoMiudo}>
              Editar
            </button>
            <button onClick={onRemover} style={botaoMiudo}>
              Remover
            </button>
          </>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--texto-2)", marginTop: 4 }}>
        {conector.metodo} {conector.endpoint}
        {conector.descricao ? ` — ${conector.descricao}` : ""}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--texto-fraco)", marginTop: 4 }}>
        entrada: {conector.entrada.length ? conector.entrada.map((c) => c.chave).join(", ") : "—"} · saída:{" "}
        {conector.saida.length ? conector.saida.map((c) => c.chave).join(", ") : "—"}
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          data-testid={`executar-${conector.id}`}
          onClick={() => setExecutarAberto((v) => !v)}
          style={botaoMiudo}
        >
          {executarAberto ? "Fechar execução" : "Executar…"}
        </button>
        {executarAberto && <ExecutarConector conector={conector} />}
      </div>
    </div>
  );
}

/**
 * SPEC-105 fatia B — executar UM passo, da tela. O formulário nasce da
 * `entrada` declarada; a resposta mostrada é a saída MAPEADA (cada campo lido
 * pelo `caminho`), com os obrigatórios ausentes ditos em voz alta (§9.3).
 */
function ExecutarConector({ conector }: { conector: ConectorDoCatalogo }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<{ saida: Record<string, unknown>; ausentes: string[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function executar() {
    setExecutando(true);
    setErro(null);
    setResultado(null);
    try {
      const parametros: Record<string, unknown> = {};
      for (const campo of conector.entrada) {
        const cru = valores[campo.chave];
        if (cru === undefined || cru === "") continue;
        if (campo.tipo === "numero") parametros[campo.chave] = Number(cru);
        else if (campo.tipo === "booleano") parametros[campo.chave] = cru === "true";
        else if (campo.tipo === "lista" || campo.tipo === "objeto") parametros[campo.chave] = JSON.parse(cru);
        else parametros[campo.chave] = cru;
      }
      const resposta = await apiCatalogoDeConectores.executar(conector.id, parametros);
      setResultado({ saida: resposta.saida, ausentes: resposta.ausentes });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed var(--borda)", paddingTop: 8 }}>
      {conector.entrada.length > 0 && (
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
          {conector.entrada.map((campo) => (
            <label key={campo.chave} style={rotulo}>
              {campo.rotulo}
              {campo.obrigatorio ? " *" : ""}
              {campo.tipo === "lista" || campo.tipo === "objeto" ? (
                <textarea
                  value={valores[campo.chave] ?? ""}
                  onChange={(e) => setValores({ ...valores, [campo.chave]: e.target.value })}
                  rows={2}
                  placeholder={campo.tipo === "lista" ? "[…]" : "{…}"}
                  style={{ ...campoInput, resize: "vertical" }}
                />
              ) : (
                <input
                  value={valores[campo.chave] ?? ""}
                  onChange={(e) => setValores({ ...valores, [campo.chave]: e.target.value })}
                  style={campoInput}
                />
              )}
            </label>
          ))}
        </div>
      )}
      <button
        data-testid={`rodar-${conector.id}`}
        onClick={() => void executar()}
        disabled={executando}
        style={{ ...botaoPrimario, marginTop: 8 }}
      >
        {executando ? "Executando…" : "Executar agora"}
      </button>
      {erro && (
        <p data-testid={`erro-execucao-${conector.id}`} style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 6 }}>
          {erro}
        </p>
      )}
      {resultado && (
        <div data-testid={`saida-${conector.id}`} style={{ marginTop: 8 }}>
          {resultado.ausentes.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--vermelho)", margin: "0 0 6px" }}>
              A resposta não trouxe: {resultado.ausentes.join(", ")} — campo obrigatório ausente não vira
              default.
            </p>
          )}
          <pre
            style={{
              fontSize: 11.5,
              background: "var(--fundo)",
              border: "1px solid var(--borda)",
              borderRadius: 8,
              padding: 10,
              overflow: "auto",
              maxHeight: 220,
              margin: 0,
            }}
          >
            {JSON.stringify(resultado.saida, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function EditorDeCampos({
  titulo,
  campos,
  comCaminho,
  onMudar,
}: {
  titulo: string;
  campos: CampoDoConector[];
  comCaminho: boolean;
  onMudar: (campos: CampoDoConector[]) => void;
}) {
  function mudar(indice: number, mudanca: Partial<CampoDoConector>) {
    onMudar(campos.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>{titulo}</strong>
        <button onClick={() => onMudar([...campos, { ...CAMPO_VAZIO }])} style={botaoMiudo}>
          + campo
        </button>
      </div>
      {campos.map((campo, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={campo.chave}
            onChange={(e) => mudar(i, { chave: e.target.value })}
            placeholder="chave"
            aria-label={`${titulo} — chave do campo ${i + 1}`}
            style={{ ...campoInput, width: 130 }}
          />
          <input
            value={campo.rotulo}
            onChange={(e) => mudar(i, { rotulo: e.target.value })}
            placeholder="rótulo"
            aria-label={`${titulo} — rótulo do campo ${i + 1}`}
            style={{ ...campoInput, width: 150 }}
          />
          <select
            value={campo.tipo}
            onChange={(e) => mudar(i, { tipo: e.target.value as CampoDoConector["tipo"] })}
            aria-label={`${titulo} — tipo do campo ${i + 1}`}
            style={{ ...campoInput, width: 100 }}
          >
            <option value="texto">texto</option>
            <option value="numero">número</option>
            <option value="booleano">booleano</option>
            <option value="lista">lista</option>
            <option value="objeto">objeto</option>
          </select>
          {comCaminho && (
            <input
              value={campo.caminho ?? ""}
              onChange={(e) => mudar(i, { caminho: e.target.value || undefined })}
              placeholder="$.dados.rps"
              aria-label={`${titulo} — caminho do campo ${i + 1}`}
              style={{ ...campoInput, width: 130 }}
            />
          )}
          <label style={{ fontSize: 11.5, display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={campo.obrigatorio === true}
              onChange={(e) => mudar(i, { obrigatorio: e.target.checked || undefined })}
            />
            obrigatório
          </label>
          <button onClick={() => onMudar(campos.filter((_, j) => j !== i))} style={botaoMiudo}>
            remover
          </button>
        </div>
      ))}
    </div>
  );
}

const rotulo: React.CSSProperties = { fontSize: 12, display: "grid", gap: 4 };

const selo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-fraco)",
  whiteSpace: "nowrap",
};

const campo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const campoInput = campo;

const botao: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
};

const botaoMiudo: React.CSSProperties = { ...botao, fontSize: 11.5, padding: "3px 8px" };

const botaoPrimario: React.CSSProperties = {
  ...botao,
  background: "var(--acento)",
  color: "#fff",
  border: "1px solid var(--acento)",
};
