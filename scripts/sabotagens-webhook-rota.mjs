/**
 * §248 da casa — as sabotagens da ROTA do webhook (fatia L).
 *
 * As da bateria pura (`sabotagens-webhook.mjs`) cobrem extração e escrita.
 * Estas cobrem a porta: o segredo que não pode voltar, o token antigo que tem
 * de morrer, o endereço que some com o nó, e o carimbo de "está vivo".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "a tabela passa a guardar o token em texto plano",
    arquivo: "packages/server/src/fluxos/webhooks.ts",
    de: '  return createHash("sha256").update(token).digest("hex");',
    para: "  return token;",
    esperado: /mostrado UMA vez/,
  },
  {
    nome: "regenerar deixa de invalidar o anterior (insere em vez de atualizar)",
    arquivo: "packages/server/src/fluxos/webhooks.ts",
    de: "  if (ja) {",
    para: "  if (false) {",
    esperado: /INVALIDA o anterior/,
  },
  {
    nome: "o endereco sobrevive ao no que saiu do desenho",
    arquivo: "packages/server/src/fluxos/webhooks.ts",
    de: "    if (doDesenho.has(linha.noId)) continue;",
    para: "    if (true) continue;",
    esperado: /SAI do desenho/,
  },
  {
    nome: "o disparo para de carimbar `ultimaEm`",
    arquivo: "packages/server/src/fluxos/webhooks.ts",
    de: "  await db.update(fluxoWebhooks).set({ ultimaEm: agora }).where(eq(fluxoWebhooks.id, id));",
    para: "  void db; void id; void agora;",
    esperado: /está vivo/,
  },
  {
    nome: "a recusa vira oraculo: conta que o fluxo existe",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: '      const recusa = { erro: "não conheço este endereço de webhook" };',
    para: '      const recusa = { erro: `não conheço este token para o fluxo "recebe"` };',
    esperado: /oráculo|não conheço este endereço/,
  },
  {
    nome: "o gatilho para de emitir o que veio no corpo",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: "      const saidaDoGatilho = saidaDoWebhook(no.parametros, req.body);",
    para: "      const saidaDoGatilho = {};",
    esperado: /campo extraído do corpo chega ao nó/,
  },
  {
    nome: "o historico perde a origem `webhook`",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: '          { origemDoDisparo: "webhook", saidaDoGatilho }',
    para: "          { saidaDoGatilho }",
    esperado: /de ONDE veio/,
  },
];

const semCor = (t) => t.replace(/\[[0-9;]*m/g, "");

let falhas = 0;
for (const s of SABOTAGENS) {
  const original = readFileSync(s.arquivo, "utf8");
  if (!original.includes(s.de)) {
    console.log(`x ALVO NAO CASOU: ${s.nome}`);
    falhas++;
    continue;
  }
  writeFileSync(s.arquivo, original.replace(s.de, s.para));
  let saida = "";
  try {
    saida = execSync("npm test -w packages/server -- webhook.test", { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    saida = (e.stdout ?? "") + (e.stderr ?? "");
  } finally {
    writeFileSync(s.arquivo, original);
  }
  const limpo = semCor(saida);
  const vermelho = /\d+ failed/.test(limpo);
  const naProvaCerta = s.esperado.test(limpo);
  const ok = vermelho && naProvaCerta;
  console.log(
    `${ok ? "ok" : "x "} ${s.nome}${vermelho ? "" : " -- NAO FICOU VERMELHO"}${naProvaCerta ? "" : " -- prova errada"}`
  );
  if (!ok) falhas++;
}
console.log(falhas === 0 ? "\n§248 (rota): todas as sabotagens acusadas na prova certa." : `\n§248 (rota): ${falhas} problema(s).`);
