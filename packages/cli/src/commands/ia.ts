import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MODELOS_CHAT,
  MODELOS_PADRAO,
  baixarModelo,
  modeloPorId,
  verificarStatus,
  type ModeloRegistrado,
} from "@gerador/llm";

function formatarMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)}MB`;
}

/** Provedor selecionado no projeto atual (`config/ia.json`) — o mesmo arquivo
 * que `gerador open` lê (SPEC-25 Fase 0). Ausente = modelo padrão. */
async function provedorSelecionado(dirProjeto: string): Promise<string> {
  try {
    const bruto = JSON.parse(await readFile(resolve(dirProjeto, "config", "ia.json"), "utf-8")) as {
      provedorPadrao?: string;
    };
    return bruto.provedorPadrao ?? MODELOS_CHAT[0].id;
  } catch {
    return MODELOS_CHAT[0].id;
  }
}

async function baixarComProgresso(modelo: ModeloRegistrado): Promise<void> {
  let ultimoPercentual = -1;
  console.log(`${modelo.papel}...`);
  const inicio = Date.now();
  await baixarModelo(modelo, {
    onProgresso: ({ bytesBaixados, bytesTotais }) => {
      if (!bytesTotais) return;
      const percentual = Math.floor((bytesBaixados / bytesTotais) * 100);
      if (percentual === ultimoPercentual) return;
      ultimoPercentual = percentual;
      process.stdout.write(`\r  ${percentual}% (${formatarMB(bytesBaixados)} / ${formatarMB(bytesTotais)})`);
    },
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(`\r  concluído em ${segundos}s.                              `);
}

async function instalar(idModelo?: string): Promise<void> {
  if (idModelo) {
    const modelo = modeloPorId(idModelo);
    if (!modelo) {
      const ids = MODELOS_CHAT.map((m) => m.id).join(", ");
      throw new Error(`modelo desconhecido: ${idModelo}. Disponíveis: ${ids}`);
    }
    console.log(`Baixando ${modelo.nome} (~${formatarMB(modelo.tamanhoAproximadoBytes)}) — só na primeira vez.\n`);
    await baixarComProgresso(modelo);
    console.log(`\nPronto. Use com \`gerador ia usar ${modelo.id}\`.`);
    return;
  }

  console.log("Baixando modelos de IA local (Qwen3-4B + Qwen3-Embedding-0.6B) — só na primeira vez.\n");
  for (const modelo of MODELOS_PADRAO) {
    // eslint-disable-next-line no-await-in-loop -- baixar um modelo de cada vez é intencional: dois downloads
    // grandes em paralelo competem pela mesma banda e só deixam a barra de progresso dos dois mais confusa.
    await baixarComProgresso(modelo);
  }
  console.log("\nPronto. Rode `gerador ia status` pra conferir.");
}

/** SPEC-25 Fase 0 — grava a escolha no mesmo `config/ia.json` que o servidor
 * local lê; é o equivalente em linha de comando ao radio da aba "Modelo de IA". */
async function usar(idModelo: string | undefined, dirProjeto: string): Promise<void> {
  const modelo = MODELOS_CHAT.find((m) => m.id === idModelo);
  if (!modelo) {
    const ids = MODELOS_CHAT.map((m) => m.id).join(" | ");
    throw new Error(`uso: gerador ia usar <${ids}>`);
  }
  await mkdir(resolve(dirProjeto, "config"), { recursive: true });
  await writeFile(
    resolve(dirProjeto, "config", "ia.json"),
    `${JSON.stringify({ provedorPadrao: modelo.id }, null, 2)}\n`,
    "utf-8"
  );
  const st = await verificarStatus(undefined, modelo.id);
  console.log(`Modelo de IA do projeto: ${modelo.nome}.`);
  if (!st.chatInstalado) console.log(`Ainda não baixado — rode \`gerador ia instalar --modelo ${modelo.id}\`.`);
}

async function status(dirProjeto: string): Promise<void> {
  const st = await verificarStatus(undefined, await provedorSelecionado(dirProjeto));
  console.log(`Diretório de modelos: ${st.caminhoModelos}\n`);
  for (const m of st.modelosChat) {
    const marca = m.instalado ? "✓" : "✗";
    const selo = m.selecionado ? " ← em uso" : "";
    const extra = m.raciocinador ? ", raciocinador" : "";
    console.log(`  ${marca} ${m.id} — ${m.papel} (~${formatarMB(m.tamanhoAproximadoBytes)}${extra})${selo}`);
  }
  console.log(`  ${st.embeddingInstalado ? "✓" : "✗"} embedding — necessário pra IA ficar pronta`);
  console.log();
  console.log(st.pronto ? "IA local pronta pra uso." : "IA local não instalada — rode `gerador ia instalar`.");
}

function valorDeFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function ia(args: string[], dirProjeto: string = process.cwd()): Promise<void> {
  const subcomando = args[0];
  switch (subcomando) {
    case "instalar":
      await instalar(valorDeFlag(args, "--modelo"));
      return;
    case "usar":
      await usar(args[1], dirProjeto);
      return;
    case "status":
      await status(dirProjeto);
      return;
    default:
      throw new Error("uso: gerador ia <instalar [--modelo <id>]|usar <id>|status>");
  }
}
