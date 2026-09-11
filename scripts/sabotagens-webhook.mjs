/**
 * §248 da casa — a bateria de sabotagens da fatia L (gatilho webhook).
 *
 * Cada entrada desliga UM mecanismo e afirma duas coisas: que a suíte fica
 * vermelha, e que fica vermelha na prova CERTA. Um teste que passa com o
 * mecanismo desligado não prova o mecanismo — prova que existe.
 *
 * O alvo de cada substituição é ASSERTADO antes de escrever: um `replace` que
 * não casa reporta "ok" e não muda nada, e já custou três medições nesta SPEC.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "extrair passa a gravar ausente como default",
    arquivo: "packages/aplicacao/src/casos-de-uso/webhook.ts",
    de: "    if (valor !== undefined) saida[campo.chave] = valor;",
    para: '    saida[campo.chave] = valor === undefined ? "" : valor;',
    esperado: /ausência não vira default/,
  },
  {
    nome: "extrair passa a despejar o corpo inteiro",
    arquivo: "packages/aplicacao/src/casos-de-uso/webhook.ts",
    de: "  const saida: Record<string, unknown> = {};",
    para: "  const saida: Record<string, unknown> = { ...(corpo as Record<string, unknown>) };",
    esperado: /resto do corpo é IGNORADO/,
  },
  {
    nome: "a escrita para de recusar chave repetida",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "            if (vistas.has(campo.chave)) {",
    para: "            if (false && vistas.has(campo.chave)) {",
    esperado: /o segundo venceria em silêncio/,
  },
  {
    nome: "a escrita para de recusar webhook sem campo",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "          if (vistas.size === 0) {",
    para: "          if (false) {",
    esperado: /não entregaria nada/,
  },
  {
    nome: "a escrita para de recusar caminho torto",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "            if (!analisarCaminho(caminho)) {",
    para: "            if (false && !analisarCaminho(caminho)) {",
    esperado: /caminho válido/,
  },
  {
    nome: "o contrato do webhook volta a ser o do TIPO, não o do nó",
    arquivo: "packages/aplicacao/src/config/gatilhos.ts",
    de: '  if (gatilho.id !== "webhook") return gatilho.saida;',
    para: "  if (true) return gatilho.saida;",
    esperado: /emite dado do NÓ e não do tipo/,
  },
];

const semCor = (t) => t.replace(/\[[0-9;]*m/g, "");

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
    saida = execSync("npm test -w packages/aplicacao -- webhook", { encoding: "utf8", stdio: "pipe" });
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
console.log(falhas === 0 ? "\n§248: todas as sabotagens acusadas na prova certa." : `\n§248: ${falhas} problema(s).`);
