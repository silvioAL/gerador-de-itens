#!/usr/bin/env node
/**
 * SPEC-32 — fatia um GGUF em pacotes npm publicáveis.
 *
 * Existe porque **um pacote npm de 2,5 GB não publica**: um pacote de 229,9 MB
 * já levou `413 Payload Too Large` no npmjs.org, e o maior real que achamos
 * publicado tem 258 MB. Então o modelo vai em partes, e `gerador ia instalar
 * --origem npm` remonta.
 *
 * Uso:
 *   node scripts/fatiar-modelo.mjs <caminho.gguf> --escopo @seu-escopo [--saida dist-modelo] [--mb 190]
 *
 * O que ele NÃO faz, de propósito: publicar. `npm publish` mexe numa conta e
 * num registry públicos — isso é decisão de quem é dono da conta, não efeito
 * colateral de um script. Ele imprime o comando pronto no fim.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const args = process.argv.slice(2);
const entrada = args.find((a) => !a.startsWith("--"));
const escopo = valor("--escopo");
const saida = valor("--saida") ?? "dist-modelo";
// 190 MB e não 250: o tarball é o gguf comprimido (que quase não comprime) MAIS
// o overhead do tar. Encostar no teto pra economizar um pacote é trocar uma
// pasta a mais por um `npm publish` que falha no meio da série.
const mbPorParte = Number(valor("--mb") ?? 190);

function valor(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (!entrada || !escopo) {
  console.error("uso: node scripts/fatiar-modelo.mjs <caminho.gguf> --escopo @seu-escopo [--saida dir] [--mb 190]");
  process.exit(1);
}

const caminho = resolve(entrada);
const info = await stat(caminho).catch(() => null);
if (!info?.isFile()) {
  console.error(`não achei o arquivo: ${caminho}`);
  process.exit(1);
}

const nomeArquivo = basename(caminho);
const bytesPorParte = mbPorParte * 1024 * 1024;
const totalPartes = Math.ceil(info.size / bytesPorParte);
const baseNome = nomeArquivo.replace(/\.gguf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const versao = valor("--versao") ?? "1.0.0";

console.log(`${nomeArquivo}: ${mb(info.size)} MB → ${totalPartes} pacotes de até ${mbPorParte} MB\n`);

const dirSaida = resolve(saida);
await rm(dirSaida, { recursive: true, force: true });
await mkdir(dirSaida, { recursive: true });

const hashTodo = createHash("sha256");
const pacotes = [];

for (let i = 0; i < totalPartes; i++) {
  const nomePacote = `${escopo}/${baseNome}-parte-${String(i + 1).padStart(2, "0")}`;
  const dirPacote = join(dirSaida, `parte-${String(i + 1).padStart(2, "0")}`);
  await mkdir(dirPacote, { recursive: true });

  const inicio = i * bytesPorParte;
  const fim = Math.min(inicio + bytesPorParte, info.size) - 1;
  const hashParte = createHash("sha256");
  const leitura = createReadStream(caminho, { start: inicio, end: fim });
  leitura.on("data", (p) => hashParte.update(p));
  await pipeline(leitura, createWriteStream(join(dirPacote, "parte.bin")));

  // O hash do todo tem que ser calculado na MESMA ordem em que as partes serão
  // concatenadas — por isso relê a parte já escrita, em vez de reaproveitar o
  // stream acima. Custa uma leitura e elimina a chance de o manifesto descrever
  // uma ordem e o arquivo outra.
  await pipeline(createReadStream(join(dirPacote, "parte.bin")), async function* (fonte) {
    for await (const pedaco of fonte) hashTodo.update(pedaco);
  });

  await writeFile(
    join(dirPacote, "package.json"),
    `${JSON.stringify(
      {
        name: nomePacote,
        version: versao,
        description: `Parte ${i + 1}/${totalPartes} de ${nomeArquivo} — dados, não código. Remontada por \`gerador ia instalar --origem npm\` (SPEC-32).`,
        license: "Apache-2.0",
        files: ["parte.bin"],
        gerador: { arquivo: nomeArquivo, indice: i + 1, total: totalPartes, sha256: hashParte.digest("hex") },
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  pacotes.push(nomePacote);
  console.log(`  ${nomePacote}  (${mb(fim - inicio + 1)} MB)`);
}

const sha256 = hashTodo.digest("hex");
await writeFile(
  join(dirSaida, "manifesto.json"),
  `${JSON.stringify({ nomeArquivo, bytes: info.size, sha256, partesNpm: pacotes }, null, 2)}\n`,
  "utf-8"
);

console.log(`\nsha256 do arquivo inteiro: ${sha256}`);
console.log(`\nCole em packages/llm/src/modelos.ts, no modelo correspondente:\n`);
console.log(`  sha256: "${sha256}",`);
console.log(`  partesNpm: ${JSON.stringify(pacotes, null, 2).replace(/\n/g, "\n  ")},`);
console.log(`\nPara publicar (decisão sua — o script não publica):`);
console.log(`  for d in ${saida}/parte-*; do (cd "$d" && npm publish --access public); done`);

function mb(bytes) {
  return Math.round(bytes / 1024 / 1024);
}
