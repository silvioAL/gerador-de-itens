/**
 * SPEC-47 — a escrita do item, legível.
 *
 * O corpo vem em markdown (o MESMO texto que vai pro tracker); aqui ele é lido
 * como texto formatado, não como código: títulos viram títulos, listas viram
 * listas, tabela e bloco de código continuam monoespaçados. Sem dependência
 * nova — o subconjunto que o gerador emite é pequeno e conhecido.
 *
 * SPEC-61 §2 — morava na `ItensScreen`. Com a fusão da tela de itens no
 * documento, o renderizador vem junto: ele é o corpo do card, e o card mudou
 * de casa. Arquivo próprio (em vez de coladinho no `DocumentoScreen`) porque
 * ele não sabe nada de documento — é um leitor de markdown-de-item.
 */
export function EscritaDoItem({ markdown }: { markdown: string }) {
  const blocos: React.ReactNode[] = [];
  const linhas = markdown.split("\n");
  let lista: string[] = [];
  let codigo: string[] | null = null;

  const fecharLista = (chave: string) => {
    if (lista.length === 0) return;
    blocos.push(
      <ul key={`ul-${chave}`} style={listaEstilo}>
        {lista.map((item, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {comNegrito(item)}
          </li>
        ))}
      </ul>
    );
    lista = [];
  };

  linhas.forEach((linha, i) => {
    if (linha.trim().startsWith("```")) {
      if (codigo === null) {
        fecharLista(String(i));
        codigo = [];
      } else {
        blocos.push(
          <pre key={`code-${i}`} style={blocoCodigoEstilo}>
            {codigo.join("\n")}
          </pre>
        );
        codigo = null;
      }
      return;
    }
    if (codigo !== null) {
      codigo.push(linha);
      return;
    }

    const titulo = /^(#{2,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharLista(String(i));
      const nivel = titulo[1].length;
      blocos.push(
        <p key={`h-${i}`} style={{ ...tituloEstilo, fontSize: nivel <= 3 ? 13 : 12 }}>
          {titulo[2]}
        </p>
      );
      return;
    }
    if (/^\s*[-*]\s+/.test(linha)) {
      lista.push(linha.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    fecharLista(String(i));
    if (linha.trim() === "") return;
    // Tabela do markdown: monoespaçada, senão as colunas não alinham.
    const ehTabela = linha.trim().startsWith("|");
    blocos.push(
      <p key={`p-${i}`} style={ehTabela ? linhaTabelaEstilo : paragrafoEstilo}>
        {comNegrito(linha)}
      </p>
    );
  });
  fecharLista("fim");

  return <>{blocos}</>;
}

/** `**negrito**` do markdown — o gerador usa em rótulo de campo e de seção. */
function comNegrito(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte
  );
}

const tituloEstilo: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--texto)",
  margin: "12px 0 4px",
};

const paragrafoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--texto-2)",
  margin: "0 0 6px",
  whiteSpace: "pre-wrap",
};

const linhaTabelaEstilo: React.CSSProperties = {
  ...paragrafoEstilo,
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
  fontSize: 11.5,
  margin: 0,
};

const listaEstilo: React.CSSProperties = {
  margin: "0 0 8px",
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--texto-2)",
};

const blocoCodigoEstilo: React.CSSProperties = {
  margin: "0 0 8px",
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--painel-alto)",
  fontSize: 11.5,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
};
