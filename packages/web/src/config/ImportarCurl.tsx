import { useState } from "react";
import { ehRecusa, interpretarCurl, mascarar, separarSegredo, type CurlInterpretado } from "@gerador/aplicacao";

/**
 * SPEC-118 fatias A e B, do lado da tela — **colar o curl preenche o
 * formulário.**
 *
 * ## O laço que este componente fecha
 *
 * Os campos `metodo` e `envelope` de `DestinoDoGateway` foram derivados de um
 * cURL que ninguém nunca colou: o produto pedia à pessoa que lesse o curl dela,
 * decompusesse mentalmente e redigitasse cada pedaço num formulário diferente.
 * Transcrição é onde some uma barra, um header, um `/v1`.
 *
 * ## As três regras da §3.1, e as três estão aqui
 *
 * 1. **O campo é efêmero.** Ao interpretar, ele se esvazia. Não guarda
 *    rascunho, não repopula ao reabrir — porque um curl que fica num `value` de
 *    textarea é um segredo que fica num `value` de textarea.
 * 2. **A chave sai dos cabeçalhos** e vai para o campo de segredo, mascarada na
 *    volta (isso é de quem chama, via `onImportar`).
 * 3. **A tela DIZ** que reconheceu um segredo e o separou. Silêncio aqui faria
 *    a pessoa achar que a chave foi para a config versionável.
 *
 * > *"É a régua mais importante desta SPEC, e a única cujo erro é
 * > irreversível: chave vazada não se desvaza."*
 *
 * ## O que ele NÃO faz
 *
 * **Não esconde o formulário depois de importar.** O §4 recusa: *"um importador
 * que preenche e some é um importador em que ninguém confia na segunda vez"*.
 * O que ele mostra é o que ENTENDEU, e os campos continuam lá para conferência.
 *
 * **Não executa.** Interpretar não é rodar — "Testar conexão" é outro gesto.
 */
export interface ImportarCurlProps {
  /**
   * Recebe o curl já interpretado, com o segredo separado. Quem decide o que
   * fazer com cada pedaço é o formulário — este componente nunca salva nada.
   */
  onImportar: (dados: CurlInterpretado & { chave?: string; cabecalhoDaChave?: string }) => void;
  /** O que a tela diz que vai preencher — muda entre exportação, importação e IA. */
  oQuePreenche: string;
  desabilitado?: boolean;
  testid?: string;
}

export function ImportarCurl({ onImportar, oQuePreenche, desabilitado, testid = "importar-curl" }: ImportarCurlProps) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /** O que foi entendido, para a pessoa conferir ANTES de salvar (§C). */
  const [resumo, setResumo] = useState<{ url: string; metodo: string; cabecalhos: number; chave?: string } | null>(null);

  function importar() {
    const resultado = interpretarCurl(texto);
    if (ehRecusa(resultado)) {
      setErro(resultado.erro);
      setResumo(null);
      return;
    }

    const { cabecalhos, chave, cabecalhoDaChave } = separarSegredo(resultado.cabecalhos);
    onImportar({ ...resultado, cabecalhos, chave, cabecalhoDaChave });

    setErro(null);
    setResumo({
      url: resultado.url,
      metodo: resultado.metodo,
      cabecalhos: Object.keys(cabecalhos).length,
      // Mascarada aqui e não guardada em lugar nenhum: o resumo existe para a
      // pessoa reconhecer QUAL chave é, não para ela ser lida de novo.
      chave: chave ? mascarar(chave) : undefined,
    });
    /**
     * Regra 1 da §3.1 — o campo se esvazia AO INTERPRETAR. É a única linha
     * deste arquivo cuja ausência é irreversível: um curl que sobra na tela
     * sobra também no screenshot de suporte e no relatório de erro.
     */
    setTexto("");
  }

  return (
    <section data-testid={testid} style={caixaEstilo}>
      <label style={labelEstilo}>
        Cole o curl que já funciona
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={desabilitado}
          rows={4}
          aria-label="Cole o curl que já funciona"
          placeholder={"curl --location 'https://gw.empresa/…' \\\n--header 'Authorization: Bearer …' \\\n--data '{…}'"}
          style={{ ...inputEstilo, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
        />
      </label>
      <p style={dicaEstilo}>
        O que o Postman exporta em “Copy as cURL”. Ele preenche {oQuePreenche} — nada é executado, e o texto some daqui
        assim que for interpretado.
      </p>

      <button
        onClick={importar}
        disabled={desabilitado || !texto.trim()}
        data-testid={`${testid}-botao`}
        style={botaoEstilo}
      >
        Interpretar e preencher
      </button>

      {erro && (
        <p data-testid={`${testid}-erro`} style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0", lineHeight: 1.5 }}>
          {erro} Confira os campos abaixo antes de salvar.
        </p>
      )}

      {resumo && (
        <div data-testid={`${testid}-resumo`} style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
          <p style={{ margin: 0, color: "var(--verde)" }}>
            Entendi: <strong>{resumo.metodo}</strong> {resumo.url}
            {resumo.cabecalhos > 0 && `, ${resumo.cabecalhos} cabeçalho(s)`}.
          </p>
          {/**
           * Regra 3 da §3.1 — a tela DIZ que separou o segredo. Sem esta linha,
           * a pessoa não tem como saber que a chave não foi para o documento de
           * configuração, e é exatamente a dúvida que ela precisa não ter.
           */}
          {resumo.chave && (
            <p data-testid={`${testid}-segredo`} style={{ margin: "4px 0 0", color: "var(--amarelo)" }}>
              🔑 Reconheci uma chave ({resumo.chave}) e a separei dos cabeçalhos — ela vai para o campo de segredo, não
              para a configuração.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px dashed var(--borda-forte)",
  borderRadius: 8,
  padding: "10px 12px",
  marginTop: 10,
  maxWidth: 560,
};

const labelEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--texto-2)",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const dicaEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--texto-mudo)",
  margin: "4px 0 0",
  lineHeight: 1.5,
};

const botaoEstilo: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  color: "var(--texto)",
  fontSize: 12.5,
  cursor: "pointer",
};
