import { Issuer, generators, type Client } from "openid-client";

/**
 * Fluxo OIDC genérico e plugável — nunca hardcoded a um vendor (Azure AD, Okta,
 * Google Workspace...). Só exercido quando `AUTH_MODE=oidc`; localmente e em
 * E2E usa-se `AUTH_MODE=dev` (ver routes/auth.ts), porque não existe IdP
 * corporativo acessível neste ambiente de desenvolvimento.
 */
function configuracao() {
  const issuerUrl = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "AUTH_MODE=oidc exige OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET e OIDC_REDIRECT_URI."
    );
  }
  return { issuerUrl, clientId, clientSecret, redirectUri };
}

let clientPromise: Promise<Client> | null = null;

async function obterClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { issuerUrl, clientId, clientSecret, redirectUri } = configuracao();
      const issuer = await Issuer.discover(issuerUrl);
      return new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ["code"],
      });
    })();
  }
  return clientPromise;
}

export async function urlDeLogin(state: string, nonce: string, codeVerifier: string): Promise<string> {
  const client = await obterClient();
  return client.authorizationUrl({
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: generators.codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });
}

/** Troca o `code` do callback pelo `id_token`, valida, e devolve o e-mail do claim. */
export async function trocarCodigoPorEmail(params: {
  callbackParams: Record<string, string>;
  state: string;
  nonce: string;
  codeVerifier: string;
}): Promise<string> {
  const client = await obterClient();
  const { redirectUri } = configuracao();
  const tokenSet = await client.callback(redirectUri, params.callbackParams, {
    state: params.state,
    nonce: params.nonce,
    code_verifier: params.codeVerifier,
  });
  const claims = tokenSet.claims();
  if (typeof claims.email !== "string") {
    throw new Error("Provedor OIDC não devolveu claim 'email' no id_token.");
  }
  // Genérico pra qualquer provedor OIDC (não só Google) — alguns permitem
  // cadastro com e-mail não verificado. Sem essa checagem, autenticação
  // vira "alguém disse que é dono desse e-mail", não uma prova de verdade.
  if (claims.email_verified !== true) {
    throw new Error(`Provedor OIDC não confirma "${claims.email}" como e-mail verificado (email_verified !== true).`);
  }
  const dominioPermitido = process.env.OIDC_DOMINIO_PERMITIDO;
  if (dominioPermitido && !claims.email.toLowerCase().endsWith(`@${dominioPermitido.toLowerCase()}`)) {
    throw new Error(`"${claims.email}" está fora do domínio permitido ("${dominioPermitido}").`);
  }
  return claims.email;
}
