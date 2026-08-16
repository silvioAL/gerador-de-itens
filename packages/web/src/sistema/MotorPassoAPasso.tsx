import { useEffect, useState } from "react";
import { valorQueEstoura, type MedicaoDeExemplo } from "@gerador/engine";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";

/**
 * §268 — COMO o motor mede, com a conta acontecendo na frente de quem lê.
 *
 * ## O buraco
 *
 * O produto diz "medido pelo motor" em quase toda tela e nunca mostra o
 * caminho. Quem lê ou acredita ou não acredita — e um número cuja origem não se
 * conhece tem o mesmo valor prático de número nenhum. Pior: a frase "o motor
 * mede" soa a IA, que é exatamente a leitura que este produto passa o tempo
 * inteiro tentando desfazer.
 *
 * ## Por que ANIMADO, e não um parágrafo
 *
 * A cadeia tem quatro elos e a ordem entre eles é a explicação inteira: o campo
 * que você preencheu, a régua que o SEU time escreveu, a conta, e o item que
 * sai. Um parágrafo com as quatro coisas empilhadas é lido como uma lista de
 * conceitos; ver o foco andar de um elo para o outro é ver um mecanismo. E a
 * pergunta que fica respondida sem ninguém escrever a resposta é "onde entra a
 * IA?" — em lugar nenhum desta sequência.
 *
 * ## O exemplo é do time, não do manual
 *
 * Os quatro passos são montados a partir de um requisito conferível da
 * configuração real (`exemploDeMedicao`). Sem nenhum, o componente diz isso e
 * não desenha conta nenhuma: explicar a régua de um time que não a tem
 * ensinaria algo falso sobre o próprio ambiente de quem está olhando.
 */
export interface MotorPassoAPassoProps {
  exemplo?: MedicaoDeExemplo;
  /** §235 — o exemplo veio da demonstração (o time de quem olha não tem régua
   * conferível). Sem a marca, o tour ensinaria uma régua que não existe ali. */
  demonstracao?: boolean;
  /** Milissegundos por elo. Zero congela no primeiro — é o que os testes usam
   * para afirmar sobre um quadro sem correr atrás do relógio. */
  intervaloMs?: number;
  onConfigurarRegras?: () => void;
}

const SIMBOLO: Record<string, string> = {
  lte: "≤",
  lt: "<",
  gte: "≥",
  gt: ">",
  eq: "=",
  ne: "≠",
  preenchido: "preenchido",
};

export function MotorPassoAPasso({ exemplo, demonstracao, intervaloMs = 1600, onConfigurarRegras }: MotorPassoAPassoProps) {
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    if (!exemplo || intervaloMs <= 0) return;
    const id = setInterval(() => setAtivo((a) => (a + 1) % 4), intervaloMs);
    return () => clearInterval(id);
  }, [exemplo, intervaloMs]);

  if (!exemplo) {
    return (
      <div data-testid="motor-passo-a-passo" style={caixaEstilo}>
        <strong style={tituloEstilo}>Como o motor mede</strong>
        <p style={{ ...textoEstilo, margin: "6px 0 0" }}>
          Seu time ainda não tem nenhuma régua <strong>conferível</strong> — as regras existem como texto para alguém
          ler, e o motor não confere nenhuma sozinho. Com uma checagem configurada, a conta aparece aqui.
        </p>
        {onConfigurarRegras && (
          <button onClick={onConfigurarRegras} style={linkEstilo} data-testid="motor-configurar-regras">
            configurar as regras do time →
          </button>
        )}
      </div>
    );
  }

  const { checagem } = exemplo;
  // `preenchido` não compara com nada: a régua é a existência do valor, e o que
  // a estoura é o branco. Formatá-la como "≥ undefined" seria a explicação de
  // como as contas fecham exibindo uma conta quebrada.
  const ehPreenchido = checagem.operador === "preenchido";
  const limite = ehPreenchido
    ? "preenchido"
    : `${SIMBOLO[checagem.operador] ?? checagem.operador} ${checagem.valor}${checagem.unidade ?? ""}`;
  const desenhado = ehPreenchido ? "em branco" : `${valorQueEstoura(checagem)}${checagem.unidade ?? ""}`;

  const passos = [
    {
      rotulo: "1. o que você desenhou",
      corpo: (
        <>
          um componente <strong>{exemplo.tech}</strong> com <strong>{checagem.campo}</strong> ={" "}
          <strong>{desenhado}</strong>
        </>
      ),
    },
    {
      rotulo: "2. a régua do seu time",
      corpo: (
        <>
          {exemplo.texto} → <strong>{checagem.campo} {limite}</strong>
          {exemplo.contextos.length > 0 && <> (só em {exemplo.contextos.join(", ")})</>}
        </>
      ),
    },
    {
      rotulo: "3. a conta",
      corpo: (
        <>
          <strong>
            {desenhado} não é {limite}
          </strong>{" "}
          — fora do padrão. Sem IA, sem rede: mesma entrada, mesmo resultado, sempre.
        </>
      ),
    },
    {
      rotulo: "4. o que sai",
      corpo: (
        <>
          um item de trabalho: <strong>trazer {checagem.campo} para {limite}</strong>
          {exemplo.porque && <> — porque {exemplo.porque}</>}
        </>
      ),
    },
  ];

  return (
    <div data-testid="motor-passo-a-passo" style={caixaEstilo}>
      <strong style={tituloEstilo}>Como o motor mede</strong>
      {demonstracao && <MarcaDeDemonstracao />}
      <ol style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
        {passos.map((p, i) => (
          <li
            key={p.rotulo}
            data-testid={`motor-passo-${i + 1}`}
            data-ativo={i === ativo ? "true" : "false"}
            style={{
              ...passoEstilo,
              // O foco anda; o resto não some. Esconder os outros elos
              // transformaria a cadeia em quatro fatos soltos, que é o formato
              // que esta tela existe para não ser.
              opacity: i === ativo ? 1 : 0.45,
              borderColor: i === ativo ? "#4f46e5" : "var(--borda)",
              transition: "opacity .35s ease, border-color .35s ease",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--texto-mudo)" }}>
              {p.rotulo}
            </span>
            <span style={textoEstilo}>{p.corpo}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: "12px 14px",
  background: "var(--painel)",
};

const tituloEstilo: React.CSSProperties = { fontSize: 13 };

const passoEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
};

const textoEstilo: React.CSSProperties = { fontSize: 12, color: "var(--texto-2)", lineHeight: 1.45 };

const linkEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: 0,
  marginTop: 6,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
};
