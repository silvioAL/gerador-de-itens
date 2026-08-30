import { useState } from "react";
import { apiAuth } from "../api/client";

export interface LoginScreenProps {
  onEntrar: (email: string) => Promise<void>;
  erro: string | null;
  /** `undefined` enquanto `GET /auth/modo` não respondeu — mesmo card, sem
   * nenhuma das duas UIs, pra não piscar um formulário errado por um instante.
   * `"local"` existe no tipo só por completude (CLI local nunca chega a
   * renderizar esta tela — `/auth/me` sempre devolve sessão) — cai no mesmo
   * "nenhuma UI" de `undefined`. */
  modo: "dev" | "oidc" | "local" | undefined;
  /** Só muda a mensagem — um convite pendente na URL (SPEC-09 §3) não muda
   * qual UI de login aparece, só o texto. */
  aceitandoConvite?: boolean;
}

/**
 * Duas UIs bem diferentes por trás do mesmo card, escolhidas por `modo`
 * (`GET /auth/modo`, ver useSessao.ts):
 * - `oidc` (produção): um botão só, navegação de página inteira pro
 *   `GET /auth/login` do servidor — ele redireciona pro Google e volta.
 * - `dev` (default local/E2E, sem IdP corporativo disponível): formulário de
 *   só e-mail contra `POST /auth/login`. Login nunca é o lugar de escolher
 *   time (achado real: a versão anterior pedia `timeId` aqui, mas não tem
 *   como saber de antemão a quais times um e-mail pertence, e um e-mail pode
 *   pertencer a mais de um; ver `EscolherTimeScreen.tsx`, que resolve isso
 *   depois da sessão existir).
 *
 * Achado real (pós-uso): até aqui só existia a UI de `dev` — `AUTH_MODE=oidc`
 * nunca tinha sido exercido de ponta a ponta, e ninguém tinha notado que o
 * botão do Google nunca chegou a ser implementado no frontend.
 */
export function LoginScreen({ onEntrar, erro, modo, aceitandoConvite = false }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEnviando(true);
    try {
      await onEntrar(email.trim());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={containerEstilo}>
      <div style={cardEstilo}>
        <strong style={{ fontSize: 15, color: "var(--texto)" }}>Gerador de Itens</strong>
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", marginTop: 4, marginBottom: 16 }}>
          {aceitandoConvite
            ? "Você recebeu um convite pra um time — entre pra aceitar."
            : "Entre pra continuar. O time é escolhido depois, entre os que você já pertence."}
        </p>

        {modo === "oidc" && (
          <a href={apiAuth.urlLoginOidc()} style={botaoGoogleEstilo}>
            <IconeGoogle />
            Continuar com Google
          </a>
        )}

        {modo === "dev" && (
          <form onSubmit={aoSubmeter}>
            {/* ACHADO REAL: "esqueci com qual credencial logar". Não havia
                credencial para lembrar — em `AUTH_MODE=dev` qualquer e-mail
                entra, sem senha. A tela pedia e-mail e não dizia isso, então
                parecia um login de verdade com uma senha esquecida. E o botão
                do Google não "sumiu": ele só existe em `AUTH_MODE=oidc`. */}
            <p style={avisoModoDevEstilo} data-testid="aviso-modo-dev">
              <strong>Modo de desenvolvimento.</strong> Qualquer e-mail entra, sem senha — não há credencial a
              lembrar. Para entrar com Google, suba o servidor com <code>AUTH_MODE=oidc</code> e os quatro{" "}
              <code>OIDC_*</code> preenchidos (veja <code>.env.example</code>).
            </p>

            <label style={labelEstilo}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoFocus
              style={inputEstilo}
            />

            {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 10, marginBottom: 0 }}>{erro}</p>}

            <button
              type="submit"
              disabled={enviando || !email.trim()}
              style={{ ...botaoEstilo, opacity: enviando ? 0.6 : 1, marginTop: 16 }}
            >
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        {modo === "oidc" && erro && (
          <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 12, marginBottom: 0 }}>{erro}</p>
        )}
      </div>
    </div>
  );
}

function IconeGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33C2.44 15.98 5.48 18 9 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V4.95H.96A8.997 8.997 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

const containerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const cardEstilo: React.CSSProperties = {
  width: 320,
  padding: 24,
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const labelEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--texto-2)",
  marginTop: 10,
  marginBottom: 4,
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  boxSizing: "border-box",
};

const botaoEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const botaoGoogleEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  fontSize: 13.5,
  fontWeight: 500,
  padding: "9px 12px",
  borderRadius: 7,
  border: "1px solid #dadce0",
  background: "var(--painel)",
  color: "#3c4043",
  textDecoration: "none",
  boxSizing: "border-box",
};

const avisoModoDevEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  background: "rgba(148, 163, 184, 0.10)",
  borderRadius: 8,
  padding: "9px 11px",
  margin: "0 0 14px",
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--texto-fraco)",
};
