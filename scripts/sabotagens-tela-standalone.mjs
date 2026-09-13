/**
 * §248 — as sabotagens da SPEC-111 fatia A (a tela que vale sozinha).
 *
 * A fatia quase não tem código próprio: ela DERIVA um fluxo e deixa a mecânica
 * da 110-B fazer o resto. Por isso estas sabotagens miram exatamente as poucas
 * decisões que são dela — se alguma passar despercebida, o "reuso" vira
 * "ninguém está guardando".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "a tela deixa de derivar fluxo (o standalone some)",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "  for (const tela of telasStandalone(documentoTelas)) declarados.push(tela);",
    para: "  void documentoTelas;",
    suite: "aplicacao",
    filtro: "telaStandalone",
    esperado: /entra junto dos outros/,
  },
  {
    nome: "o fluxo implicito deixa de ser marcado (a galeria mostraria em dobro)",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "    implicito: true,",
    para: "    implicito: false,",
    suite: "aplicacao",
    filtro: "telaStandalone",
    esperado: /MARCADO como implícito/,
  },
  {
    nome: "o no derivado deixa de ser a TELA (nada mais espera gente)",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: '    nos: [{ id: "tela", tipo: "tela", refId: refIdDaTelaDeclarada(tela.id), posicao: { x: 80, y: 120 }, parametros: {} }],',
    para: '    nos: [{ id: "tela", tipo: "funcao", refId: "derivacao", posicao: { x: 80, y: 120 }, parametros: {} }],',
    suite: "aplicacao",
    filtro: "telaStandalone",
    esperado: /faz a execução esperar gente/,
  },
  {
    nome: "o prefixo reservado deixa de ser recusado na escrita",
    arquivo: "packages/aplicacao/src/config/fluxos.ts",
    de: "    if (id.startsWith(PREFIXO_DO_FLUXO_DA_TELA)) {",
    para: "    if (false) {",
    suite: "aplicacao",
    filtro: "telaStandalone",
    esperado: /impossível de escrever à mão/,
  },
  {
    nome: "o servidor para de passar as telas para a derivacao",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: "      fluxos: fluxosEmVigor(papeis, fluxosDoc.documento, normalizarExportador(exportadorDoc.documento), telasDoc.documento),",
    para: "      fluxos: fluxosEmVigor(papeis, fluxosDoc.documento, normalizarExportador(exportadorDoc.documento)),",
    suite: "server",
    filtro: "telaStandalone",
    esperado: /fluxo IMPLÍCITO de um nó/,
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
    saida = execSync(`npm test -w packages/${s.suite} -- ${s.filtro}`, { encoding: "utf8", stdio: "pipe" });
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
