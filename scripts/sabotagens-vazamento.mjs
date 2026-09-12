/**
 * §248 — as sabotagens da correção do vazamento entre times.
 *
 * Cada uma volta UMA das quatro rotas ao que ela era, e afirma que a prova
 * correspondente fica vermelha. É a diferença entre "escrevi um filtro" e "o
 * filtro está segurando alguma coisa".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SABOTAGENS = [
  {
    nome: "o historico volta a devolver execucao de qualquer time",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: "    return { execucoes: linhas.filter((l) => execucaoVisivelPara(visiveis, email, l, timeId)).slice(0, 20) };",
    para: "    return { execucoes: linhas.slice(0, 20) };",
    esperado: /não aparece na listagem do fluxo de fábrica/,
  },
  {
    nome: "pedir um time alheio deixa de estreitar a lista",
    arquivo: "packages/server/src/auth/visibilidade.ts",
    de: "  return timeIdPedido ? meus.filter((t) => t === timeIdPedido) : meus;",
    para: "  return timeIdPedido ? [timeIdPedido] : meus;",
    esperado: /não abre a porta/,
  },
  {
    nome: "a regua da POLITICA para de recortar (feedback)",
    arquivo: "packages/server/src/auth/visibilidade.ts",
    de: "  return visiveis.includes(timeIdDaLinha);",
    para: "  return true;",
    esperado: /não entra na listagem/,
  },
  {
    nome: "execucao sem time volta a ser de todos (a regua do EVENTO)",
    arquivo: "packages/server/src/auth/visibilidade.ts",
    de: "  if (semTime) return linha.email === email;",
    para: "  if (semTime) return true;",
    esperado: /SEM time é de quem a rodou/,
  },
  {
    nome: "o stage volta a abrir para quem nao e do time",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: "        return execucao.timeId === CAMPO_GLOBAL ? null : execucao.timeId;",
    para: "        return null;",
    esperado: /cadeado na PORTA|recusado — não renderizado/,
  },
  {
    nome: "o feedback volta a atravessar o time",
    arquivo: "packages/server/src/routes/pdca.ts",
    de: "    return todos.filter((f) => visivelPara(visiveis, f.timeId));",
    para: "    return todos;",
    esperado: /não entra na listagem/,
  },
  {
    nome: "a saude das ultimas volta a ser publica",
    arquivo: "packages/server/src/routes/fluxos.ts",
    de: '  app.get("/fluxos/execucoes/ultimas", { preHandler: exigirSessao }, async (req) => {',
    para: '  app.get("/fluxos/execucoes/ultimas", async (req) => {',
    esperado: /deixou de ser pública|401/,
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
    saida = execSync("npm test -w packages/server -- vazamentoEntreTimes", { encoding: "utf8", stdio: "pipe" });
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
