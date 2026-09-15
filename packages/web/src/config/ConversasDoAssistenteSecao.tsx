import { useState } from "react";
import { CONVERSAS_DO_ASSISTENTE, type ConversaDoAssistente } from "@gerador/aplicacao";
import { SugerirComIa } from "./SugerirComIa";
import type { ConfigPipelineAgentes, SugestaoPreambuloDeConversa } from "../api/client";

/**
 * SPEC-117 fatias B, C e F — **a seção que faltava: as conversas do assistente.**
 *
 * ## A queixa que a originou, e ela era precisa
 *
 * > *"eu tenho um certo agente pronto para isso, o problema é que não tenho
 * > flexibilidade para editar os agentes do assistente na ferramenta"*
 *
 * O produto chamava três coisas de agente e só uma era editável. Oito conversas
 * tinham o prompt inteiro escrito em TypeScript — trocar o comportamento de
 * qualquer uma delas exigia um deploy.
 *
 * ## O que esta seção NÃO faz, e é a decisão que a simplifica
 *
 * O texto **acrescenta**; ele não substitui o prompt do produto (pergunta 2,
 * respondida pelo usuário). Por isso não há "editar a partir deste texto" como
 * nos papéis da esteira: lá o preâmbulo É o prompt, e editar cria uma cópia que
 * para de acompanhar melhorias. Aqui o prompt do produto continua inteiro, e o
 * que se escreve entra num bloco nomeado no fim dele.
 *
 * É por isso que a **anatomia** de cada conversa aparece junto: sem ela a
 * pessoa não tem como saber o que já está sendo dito, e reescreveria em cima.
 */
export interface ConversasDoAssistenteSecaoProps {
  conversas: ConfigPipelineAgentes["conversas"];
  onMudar: (conversas: ConfigPipelineAgentes["conversas"]) => void;
  desabilitado?: boolean;
}

const ROTULO_ORIGEM: Record<string, string> = {
  configuravel: "você configura",
  "da-quebra": "vem do trabalho",
  fixo: "fixo do produto",
};

export function ConversasDoAssistenteSecao({ conversas, onMudar, desabilitado }: ConversasDoAssistenteSecaoProps) {
  const [expandida, setExpandida] = useState<string | null>(null);

  const preambuloDe = (id: string) => conversas?.find((c) => c.id === id)?.preambulo ?? "";

  /**
   * Escrever nada é **apagar a entrada**, não gravar string vazia.
   *
   * A normalização do servidor descarta preâmbulo vazio de qualquer jeito; sem
   * isto a tela mandaria uma entrada que volta sumida, e quem recarregasse veria
   * a diferença sem entender por quê.
   */
  function mudarPreambulo(id: string, texto: string) {
    const semEsta = (conversas ?? []).filter((c) => c.id !== id);
    const proximas = texto.trim() ? [...semEsta, { id, preambulo: texto }] : semEsta;
    onMudar(proximas.length > 0 ? proximas : undefined);
  }

  return (
    <section data-testid="conversas-do-assistente" style={cardEstilo}>
      <strong style={{ fontSize: 13, color: "var(--texto)" }}>Conversas do assistente</strong>
      <p style={proseEstilo}>
        Cada uma destas conversas tem um prompt do produto, com as regras que ela precisa respeitar. Aqui você{" "}
        <strong>acrescenta</strong> as instruções do seu time — elas entram num bloco no fim do prompt, e o que o
        produto pede continua valendo em caso de conflito.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CONVERSAS_DO_ASSISTENTE.map((conversa) => (
          <CartaoDaConversa
            key={conversa.id}
            conversa={conversa}
            preambulo={preambuloDe(conversa.id)}
            aberta={expandida === conversa.id}
            onAlternar={() => setExpandida(expandida === conversa.id ? null : conversa.id)}
            onMudar={(texto) => mudarPreambulo(conversa.id, texto)}
            desabilitado={desabilitado}
          />
        ))}
      </div>
    </section>
  );
}

function CartaoDaConversa({
  conversa,
  preambulo,
  aberta,
  onAlternar,
  onMudar,
  desabilitado,
}: {
  conversa: ConversaDoAssistente;
  preambulo: string;
  aberta: boolean;
  onAlternar: () => void;
  onMudar: (texto: string) => void;
  desabilitado?: boolean;
}) {
  return (
    <div data-testid={`conversa-config-${conversa.id}`} style={itemEstilo}>
      <button onClick={onAlternar} style={nomeBotaoEstilo}>
        <b style={{ color: "var(--texto)" }}>{conversa.rotulo}</b>
        <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>{conversa.onde}</span>
        {/* O sinal de que este time mexeu aqui — o mesmo "prompt custom" dos
            papéis, e pelo mesmo motivo: sem ele, saber quais conversas foram
            personalizadas exige abrir as oito. */}
        {preambulo.trim() ? <span style={tagEstilo}>instruções do time</span> : null}
      </button>

      {aberta && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <p style={{ ...proseEstilo, margin: 0 }}>{conversa.oQueFaz}.</p>

          <label style={campoEstilo}>
            Instruções do seu time (acrescentam ao prompt do produto)
            <textarea
              value={preambulo}
              onChange={(e) => onMudar(e.target.value)}
              disabled={desabilitado}
              rows={5}
              placeholder={"ex.: cite o número do chamado quando houver, e prefira o vocabulário do time de pagamentos"}
              data-testid={`preambulo-conversa-${conversa.id}`}
              style={{ ...inputEstilo, resize: "vertical", fontFamily: "inherit" }}
            />
            <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
              Vazio = só o prompt do produto, como é hoje.
            </span>
          </label>

          {/**
           * SPEC-117 fatia F — *"a aba já sabe propor um papel a partir de uma
           * frase; propor um preâmbulo de conversa é o mesmo gesto"*.
           *
           * O contexto que vai junto é o que a conversa FAZ: sem ele o modelo
           * escreveria um preâmbulo genérico, que é exatamente o que não serve.
           */}
          <SugerirComIa<SugestaoPreambuloDeConversa>
            alvo="preambulo-de-conversa"
            contexto={`A conversa é "${conversa.rotulo}" (${conversa.onde}): ${conversa.oQueFaz}.`}
            exemplo="ex.: nosso time usa Hexagonal; cite as portas envolvidas"
            onSugestao={(s) => onMudar(s.preambulo ?? "")}
          />

          {/**
           * SPEC-117 fatia B — **a anatomia existe para TODA conversa agora.**
           *
           * A §0.2 mediu a falta: a classificação só existia para a esteira, e
           * *"não há como uma pessoa saber o que ali é dela e o que é do
           * produto, porque nada é dela"*. É esta lista que torna a caixa acima
           * legível — sem ela, quem escreve reescreve o que o produto já diz.
           */}
          <details style={anatomiaEstilo} data-testid={`anatomia-${conversa.id}`}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--texto)" }}>
              <strong>Como o prompt desta conversa é montado</strong>
            </summary>
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
              {conversa.anatomia.map((parte) => (
                <li key={parte.id} style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
                  <strong style={{ color: "var(--texto)" }}>{parte.rotulo}</strong>{" "}
                  <span style={tagOrigemEstilo}>{ROTULO_ORIGEM[parte.origem]}</span>
                  {/* SPEC-117 fatia D — o que nenhum preâmbulo derruba, dito na
                      tela. Saber que "somente leitura" não sai é o que permite
                      escrever o resto sem medo. */}
                  {parte.inegociavel && <span style={tagInegociavelEstilo}>não sai do prompt</span>}
                  {parte.ondeSeEdita ? <div style={{ marginTop: 3 }}>Onde se mexe: {parte.ondeSeEdita}.</div> : null}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
  maxWidth: 680,
  marginTop: 14,
};

const proseEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: "6px 0 10px",
};

const itemEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--painel-alto)",
};

const nomeBotaoEstilo: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
  fontSize: 13,
};

const tagEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "1px 6px",
  borderRadius: 999,
  border: "1px solid var(--acento)",
  color: "var(--acento)",
};

const tagOrigemEstilo: React.CSSProperties = {
  fontSize: 10.5,
  padding: "1px 6px",
  borderRadius: 999,
  background: "var(--painel-alto)",
  color: "var(--texto-mudo)",
};

const tagInegociavelEstilo: React.CSSProperties = {
  ...tagOrigemEstilo,
  marginLeft: 4,
  border: "1px solid var(--amarelo)",
  color: "var(--amarelo)",
};

const campoEstilo: React.CSSProperties = {
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

const anatomiaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--painel)",
};
