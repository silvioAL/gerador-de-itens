/**
 * §255 — O MOTOR: o que calcula, e onde a IA entra.
 *
 * ## SPEC-83 — por que ele saiu da `Jornada`
 *
 * Ele morava dentro dela, e a landing renderizava as duas: o motor aparecia
 * antes de cinco etapas que repetiam estágios que o círculo já tinha mostrado.
 * Fora, ele tem uma casa só — e a `Jornada` volta a ser o que é, um passo a
 * passo de uso.
 *
 * Pedido do usuário: *"sinto falta de uma explicação melhor sobre o que é o
 * motor, como ele funciona do ponto de vista do usuário, como ele se conecta
 * com o resto"*.
 *
 * O texto anterior dizia "um motor determinístico — não um LLM" e seguia em
 * frente. Isso diz o que ele NÃO é. Quem chega precisa do contrário: o que ele
 * é, o que ele decide, e onde a IA entra — porque a divisão entre os dois é a
 * tese do produto inteiro.
 *
 * ## SPEC-92 fatia A — **de 207 palavras para 111, e o corte foi medido duas vezes**
 *
 * Esta era a única peça da landing feita **só de prosa autoral**: as outras seis
 * desenham `ciclo.ts` e `conceito.ts`. Era também a mais densa — 207 palavras em
 * 319 px, três parágrafos corridos no meio de uma página que o usuário achou
 * longa demais.
 *
 * E era a **terceira** escrita da mesma coisa. A seção *"A divisão de trabalho"*
 * do `CONCEITO.md` — a fonte canônica, pela regra do §323 — já dizia o que os
 * dois primeiros parágrafos daqui diziam, com as mesmas palavras em alguns
 * trechos. Então o texto **não foi apagado: ele já estava no lugar canônico**, e
 * o que havia aqui era a cópia.
 *
 * ### O primeiro corte foi longe demais, e os testes disseram
 *
 * A primeira escrita desta rodada deixou 62 palavras, e derrubou dois dos quatro
 * casos de `OMotor.test.tsx`: *"põe a divisão motor × IA em palavras"* e *"diz o
 * que determinismo DÁ, não que ele existe"*.
 *
 * Eles estavam certos em cair. O que saiu não era redundância — era a resposta a
 * *"e o que isso me dá?"*: o mesmo desenho produz sempre os mesmos itens, e a
 * regra atrás de cada cobrança é editável. Numa rodada cujo pedido foi **"uma
 * cara mais comercial"**, cortar justamente o argumento de valor é o corte
 * errado.
 *
 * A régua que sobrou vale para a peça inteira: **os quatro testes passam sem uma
 * vírgula mudada**. Se o corte tivesse levado conteúdo, algum deles continuaria
 * vermelho — e mudar o teste para acompanhar o corte seria apagar a prova junto
 * com a coisa provada.
 */
export function OMotor() {
  return (
    <section
      data-testid="explicacao-do-motor"
      style={{
        border: "1px solid var(--borda)",
        borderLeft: "3px solid var(--acento-indigo)",
        borderRadius: 12,
        padding: "14px 16px",
        maxWidth: 680,
        margin: "0 auto",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--texto)" }}>
        Quem faz o quê: o motor calcula, a IA escreve, você confirma
      </h3>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "8px 0 0" }}>
        O motor lê o seu desenho e a configuração do time, e faz três coisas: <strong>mede</strong> o desenho a cada
        mudança, <strong>deriva</strong> os itens de trabalho e <strong>monta</strong> os textos a partir dos modelos.
        Não conversa com IA, não vai à rede, não guarda estado.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        <strong>A divisão é toda a ideia:</strong> o motor decide a <em>estrutura</em> — que itens existem, o que falta
        preencher, o que sai do padrão. A IA escreve o <em>texto</em>, nunca o contrário, e nada que ela propõe conta
        antes de você confirmar.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        Por isso o mesmo desenho produz sempre os mesmos itens: dá para mudar uma coisa e comparar o antes e o depois. E
        quando ele aponta algo, existe uma regra explícita atrás — que você pode ler, discordar e mudar.
      </p>
    </section>
  );
}

/**
 * Explicação de "como funciona" — usada tanto na aba "A jornada" da
 * JourneyModal (onboarding pós-login) quanto na landing page pública
 * (SPEC-11 §3, antes do login). Um componente só, pra não dessincronizar
 * duas explicações da mesma coisa.
 */
