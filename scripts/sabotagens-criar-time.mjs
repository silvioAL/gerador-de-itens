/**
 * §248 — as sabotagens do conserto de "criar time".
 *
 * O defeito relatado tinha três camadas, e cada sabotagem devolve UMA delas:
 * o id cru, a recusa muda, e o nome perdido.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "o id volta a ser o nome CRU (o defeito do relato)",
    arquivo: "packages/server/src/routes/times.ts",
    de: "    const timeId = corpo.data.timeId?.trim() || idDeTimeAPartirDoNome(nomeDigitado);",
    para: "    const timeId = corpo.data.timeId?.trim() || nomeDigitado;",
    esperado: /Consignado Público” CRIA o time/,
  },
  {
    nome: "a derivacao para de tirar acento",
    arquivo: "packages/server/src/routes/times.ts",
    de: '    .replace(/[\\u0300-\\u036f]/g, "")',
    para: "    .replace(/(?!)/g, \"\")",
    esperado: /tira acento, maiúscula e espaço/,
  },
  {
    nome: "a recusa volta a ser o dump do validador",
    arquivo: "packages/server/src/routes/times.ts",
    /**
     * Alvo de UMA linha de propósito: os arquivos do repo são CRLF, e um alvo
     * de várias linhas com `\n` nunca casa — o script reportaria "ALVO NAO
     * CASOU" por defeito do medidor, não do código.
     */
    de: '.send({ erro: `"${nomeDigitado}" não vira um endereço válido — use ao menos três letras ou números` });',
    para: ".send({ erro: { formErrors: [], fieldErrors: {} } });",
    esperado: /recusado com FRASE, não com dump/,
  },
  {
    nome: "o `timeId` pronto volta a passar sem validacao",
    arquivo: "packages/server/src/routes/times.ts",
    de: '    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "o endereço aceita letras minúsculas, números e hífen (ex.: time-pagamentos)")',
    para: "    .regex(/.*/)",
    esperado: /mal formatado continua RECUSADO/,
  },
  {
    nome: "o nome digitado se perde (o rotulo vira o endereco)",
    arquivo: "packages/server/src/routes/times.ts",
    de: "    await db.insert(times).values({ id: timeId, organizacaoId: organizacao.id, nome: nomeDigitado });",
    para: "    await db.insert(times).values({ id: timeId, organizacaoId: organizacao.id, nome: timeId });",
    esperado: /CRIA o time/,
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
    saida = execSync("npm test -w packages/server -- criarTime", { encoding: "utf8", stdio: "pipe" });
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
