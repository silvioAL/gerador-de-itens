import { PROVAS } from "./provas";

/**
 * SPEC-95 fatia D — **a página técnica, e a primeira do produto.**
 *
 * ## Os dois públicos, na ordem (SPEC-95 §1.1)
 *
 * *"Devemos pensar também no público não técnico, devem entender o story
 * telling."* — e a régua que saiu daí: **toda página abre respondendo em
 * linguagem comum, e só então desce.** Quem parar no primeiro terço entendeu o
 * assunto; quem continuar encontra o mecanismo e a prova.
 *
 * Não é diluir. É a mesma disciplina que o `OPassoContido` já segue desde o
 * §328: o enunciado em texto vem **antes** da figura, para quem não a vê ter a
 * tese inteira sem ela.
 *
 * ## Por que "arquitetura" e "segurança" na mesma página
 *
 * Nove páginas não cabem num menu que já rola com cinco em 360 px (§341, e a
 * SPEC-95 §7.3 registrou o limite). Agrupar foi a saída, e ela é honesta: quem
 * pergunta *"o que roda onde?"* é quem pergunta *"quem pode ver o quê?"*.
 */
export function PaginaArquitetura() {
  return (
    <div style={{ display: "grid", gap: 34 }}>
      {/* ── A ABERTURA, sem jargão ──────────────────────────────────────────
          Nenhum termo do vocabulário interno aqui sem estar explicado ao lado.
          É a régua da SPEC-95 §1.1, e ela vale para a primeira tela. */}
      <section data-testid="arquitetura-abertura">
        <p style={{ ...proseEstilo, fontSize: 15.5 }}>
          A ferramenta é dividida em duas partes que fazem coisas muito diferentes, e essa divisão é o que permite
          confiar no resultado.
        </p>
        <p style={{ ...proseEstilo, marginTop: 12 }}>
          Uma parte <strong>calcula</strong>: lê o seu desenho e as regras do time e chega sempre à mesma conclusão, do
          jeito que uma planilha chega. Ela não conversa com nenhuma inteligência artificial, não vai à internet e não
          guarda nada por conta própria. A outra parte <strong>escreve texto</strong> com IA — e nada do que ela
          escreve vale antes de uma pessoa confirmar.
        </p>
        <p style={{ ...proseEstilo, marginTop: 12 }}>
          É por isso que dá para discordar da ferramenta: quando ela aponta algo, existe uma regra explícita atrás, e
          essa regra é sua. Abaixo, o mesmo, com o detalhe técnico — e com o teste que sustenta cada afirmação.
        </p>
      </section>

      <Bloco titulo="O que roda onde">
        <Linha
          rotulo="O motor"
          texto="Funções puras, sem entrada nem saída: não abre conexão, não lê disco, não guarda estado. Recebe o desenho e a configuração, devolve medidas, itens e textos montados a partir de modelos. É o pacote que dá para rodar sem servidor, sem banco e sem rede — e é por isso que o resultado é reproduzível."
        />
        <Linha
          rotulo="A camada de aplicação"
          texto="Casos de uso e portas. Ela conhece o que o produto faz, e não conhece Postgres, HTTP nem provedor de IA — cada um deles entra por uma porta declarada."
        />
        <Linha
          rotulo="Os adaptadores"
          texto="A implementação de cada porta: banco, gateway de IA, cofre de segredos, exportação para o tracker, leitura de decisões de arquitetura. Trocar um não toca no motor."
        />
        <Linha
          rotulo="A IA"
          texto="Sempre atrás de um gateway configurável pelo time, nunca embutida. O produto não implementa protocolo de integração: quem fala com o mundo é o gateway, e o endereço dele é configuração."
        />
      </Bloco>

      <Bloco titulo="Quem pode ver o quê">
        <Linha
          rotulo="Times e níveis"
          texto="Uma pessoa pode estar em vários times, com nível próprio em cada um: visualizar, operar ou administrar. Administrar não é o mesmo que operar — mexer em configuração é decisão à parte."
        />
        <Linha
          rotulo="Papéis por recurso"
          texto="Além do nível, há papéis com permissão por área de configuração. Quando o controle está ligado, a área negada some do menu e o acesso pelo link direto vira um pedido de ajuste, em vez de uma porta fechada sem explicação."
        />
        <Linha
          rotulo="Segredos"
          texto="Credencial de IA e token de integração vivem num cofre, nunca no documento nem no diagrama, e não voltam pela API depois de gravados."
        />
        <Linha
          rotulo="Trilha"
          texto="Quem fez o quê, em que recurso e quando. E, dentro do conteúdo, cada valor carrega de onde veio — digitado, extraído, inferido ou sugerido pela IA —, o que é uma trilha mais fina que a de acesso."
        />
      </Bloco>

      {/* ── AS PROVAS ─────────────────────────────────────────────────────── */}
      <section data-testid="arquitetura-provas">
        <h2 style={tituloEstilo}>E aqui está como conferir</h2>
        <p style={{ ...proseEstilo, marginBottom: 18 }}>
          Cada afirmação acima tem um teste no repositório que a sustenta. Não é uma lista de quantos testes existem —
          esse número não diria nada. São <strong>estas</strong> afirmações, com <strong>este</strong> arquivo ao lado:
          se a prova sumir, a suíte cai no mesmo commit.
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {PROVAS.map((p) => (
            <li
              key={p.arquivo}
              data-testid={`prova-${p.arquivo}`}
              style={{
                border: "1px solid var(--borda)",
                borderLeft: "3px solid var(--verde)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <strong style={{ fontSize: 14, color: "var(--texto)", lineHeight: 1.4 }}>{p.afirmacao}</strong>
              <p style={{ ...proseEstilo, margin: "6px 0 0" }}>{p.porque}</p>
              {/* O caminho é `code` porque é um caminho: quem for conferir vai
                  copiá-lo, e um caminho em fonte proporcional se lê pior e se
                  copia com erro. */}
              <p style={{ margin: "8px 0 0" }}>
                <code
                  style={{
                    fontSize: 11.5,
                    color: "var(--acento-gente-texto)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {p.arquivo}
                </code>
              </p>
              <p style={{ fontSize: 12, color: "var(--texto-fraco)", lineHeight: 1.6, margin: "4px 0 0" }}>
                {p.oQueEleProva}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={tituloEstilo}>{titulo}</h2>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Linha({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "12px 14px" }}>
      <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>{rotulo}</strong>
      <p style={{ ...proseEstilo, margin: "4px 0 0" }}>{texto}</p>
    </div>
  );
}

const tituloEstilo: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: "var(--texto)",
  margin: 0,
  lineHeight: 1.3,
};

const proseEstilo: React.CSSProperties = {
  fontSize: 13.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: 0,
};
