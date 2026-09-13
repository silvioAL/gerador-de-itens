/**
 * §248 — as sabotagens do nó opcional (SPEC-112 A).
 *
 * A fatia tem quatro decisões e cada sabotagem devolve uma: pular, registrar
 * `pulado`, não derrubar quem depende, e só rodar quando pedem.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "o opcional volta a rodar sozinho",
    arquivo: "packages/aplicacao/src/casos-de-uso/fluxos.ts",
    de: "    if (no.opcional && opcoes.ateNo !== noId) {",
    para: "    if (false) {",
    esperado: /é PULADO/,
  },
  {
    nome: "o pulado volta a DERRUBAR quem depende dele",
    arquivo: "packages/aplicacao/src/casos-de-uso/fluxos.ts",
    de: '      return dela !== "sucesso" && dela !== "pulado";',
    para: '      return dela !== "sucesso";',
    esperado: /não derruba quem depende dele/,
  },
  {
    nome: "o rastro deixa de registrar o pulado",
    arquivo: "packages/aplicacao/src/casos-de-uso/fluxos.ts",
    de: '      rastro.push({ noId, tipo: no.tipo, refId: no.refId, estado: "pulado", duracaoMs: 0 });',
    para: "      void noId;",
    esperado: /o rastro diz isso/,
  },
  {
    nome: "pedir a etapa deixa de acorda-la",
    arquivo: "packages/aplicacao/src/casos-de-uso/fluxos.ts",
    de: "    if (no.opcional && opcoes.ateNo !== noId) {",
    para: "    if (no.opcional) {",
    esperado: /o faz rodar/,
  },
  {
    nome: "a saude do fluxo volta a tratar pulado como problema (R4)",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: '          ok: !comFalha && nos.every((n) => n.estado === "sucesso" || n.estado === "pulado"),',
    para: '          ok: !comFalha && nos.every((n) => n.estado === "sucesso"),',
    esperado: /pulado não derruba a saúde/,
    suite: "server",
    filtro: "noOpcionalNaRota",
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
  const suite = s.suite ?? "aplicacao";
  const filtro = s.filtro ?? "noOpcional";
  try {
    saida = execSync(`npm test -w packages/${suite} -- ${filtro}`, { encoding: "utf8", stdio: "pipe" });
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
