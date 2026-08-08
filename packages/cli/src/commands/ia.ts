import { MODELOS, baixarModelo, verificarStatus, type ModeloRegistrado } from "@gerador/llm";

function formatarMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)}MB`;
}

async function instalar(): Promise<void> {
  console.log("Baixando modelos de IA local (Qwen3-4B + Qwen3-Embedding-0.6B) — só na primeira vez.\n");

  for (const modelo of MODELOS) {
    let ultimoPercentual = -1;
    console.log(`${modelo.papel}...`);
    const inicio = Date.now();
    // eslint-disable-next-line no-await-in-loop -- baixar um modelo de cada vez é intencional: dois downloads
    // grandes em paralelo competem pela mesma banda e só deixam a barra de progresso dos dois mais confusa.
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

  console.log("\nPronto. Rode `gerador ia status` pra conferir.");
}

function linhaStatus(nome: string, modelo: ModeloRegistrado, instalado: boolean): string {
  const marca = instalado ? "✓" : "✗";
  return `  ${marca} ${nome} — ${modelo.papel} (~${formatarMB(modelo.tamanhoAproximadoBytes)})`;
}

async function status(): Promise<void> {
  const st = await verificarStatus();
  console.log(`Diretório de modelos: ${st.caminhoModelos}\n`);
  console.log(linhaStatus("chat", MODELOS[0], st.chatInstalado));
  console.log(linhaStatus("embedding", MODELOS[1], st.embeddingInstalado));
  console.log();
  console.log(st.pronto ? "IA local pronta pra uso." : "IA local não instalada — rode `gerador ia instalar`.");
}

export async function ia(args: string[]): Promise<void> {
  const subcomando = args[0];
  switch (subcomando) {
    case "instalar":
      await instalar();
      return;
    case "status":
      await status();
      return;
    default:
      throw new Error("uso: gerador ia <instalar|status>");
  }
}
