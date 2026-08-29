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
 * tese do produto inteiro, e ela não estava escrita em lugar nenhum que uma
 * pessoa leia.
 */
export function OMotor() {
  return (
    <section
      data-testid="explicacao-do-motor"
      style={{
        border: "1px solid var(--borda)",
        borderLeft: "3px solid #6366f1",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 22,
        maxWidth: 680,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--texto)" }}>
        Antes das etapas: o que é o motor
      </h3>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "8px 0 0" }}>
        O motor é a parte que <strong>calcula</strong>. Ele lê duas coisas — o seu desenho e a configuração do time
        (tipos de componente, padrões, réguas, modelos de documento) — e faz três: <strong>mede</strong> o desenho a
        cada mudança, <strong>deriva</strong> os itens de trabalho, e <strong>monta</strong> os textos a partir dos
        modelos. Não conversa com IA, não vai à rede, não guarda estado.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        <strong>A divisão de trabalho é toda a ideia:</strong> o motor decide a <em>estrutura</em> — que itens existem,
        o que falta preencher, o que sai do padrão, em que ordem as coisas dependem umas das outras. A IA escreve o{" "}
        <em>texto</em> — a história do usuário, os critérios, o porquê de uma proposta. Nunca o contrário. Por isso todo
        valor carrega de onde veio, e nada que a IA propõe conta antes de você confirmar.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        <strong>O que isso te dá na prática:</strong> o mesmo desenho produz sempre os mesmos itens, então dá para
        mudar uma coisa e comparar o antes e o depois. Quando o motor aponta algo, existe uma regra explícita por trás
        — e você pode discordar dela, mudá-la na configuração, ou registrar que decidiu contrariá-la de propósito. Uma
        medida que ninguém consegue contestar vira ruído ou dogma; esta você contesta.
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
