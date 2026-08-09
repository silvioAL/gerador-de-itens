import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ID_PROVEDOR_GATEWAY,
  MODELOS_CHAT,
  MODELOS_PADRAO,
  baixarModelo,
  idsDeProvedorValidos,
  lerCredenciais,
  modeloPorId,
  resumirCredencial,
  salvarCredencial,
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
async function usar(idProvedor: string | undefined, dirProjeto: string): Promise<void> {
  const validos = idsDeProvedorValidos();
  if (!idProvedor || !validos.includes(idProvedor)) {
    throw new Error(`uso: gerador ia usar <${validos.join(" | ")}>`);
  }
  await gravarProvedor(idProvedor, dirProjeto);

  const st = await verificarStatus(undefined, idProvedor);
  // Sem `!`: um status que não liste o id (servidor antigo, mock) não pode
  // derrubar o comando — o id já é informação suficiente pra mensagem.
  const escolhido = st.modelosChat.find((m) => m.id === idProvedor);
  console.log(`Modelo de IA do projeto: ${escolhido?.nome ?? idProvedor}.`);
  if (!st.chatInstalado) {
    console.log(
      idProvedor === ID_PROVEDOR_GATEWAY
        ? "Falta a credencial — rode `gerador ia conectar --url <base> --chave <chave> --modelo <nome>`."
        : `Ainda não baixado — rode \`gerador ia instalar --modelo ${idProvedor}\`.`
    );
  }
}

async function gravarProvedor(idProvedor: string, dirProjeto: string): Promise<void> {
  await mkdir(resolve(dirProjeto, "config"), { recursive: true });
  await writeFile(
    resolve(dirProjeto, "config", "ia.json"),
    `${JSON.stringify({ provedorPadrao: idProvedor }, null, 2)}\n`,
    "utf-8"
  );
}

/**
 * SPEC-25 Fase 2 — conecta o projeto a um gateway compatível com OpenAI.
 *
 * Três dados e nada mais (§4.6): base URL, chave, nome do modelo. A chave vai
 * pra `~/.gerador/credenciais.json` — NUNCA pra `config/`, que é versionável.
 * Por isso este comando não recebe `dirProjeto` pra credencial: ela é da
 * máquina, não do repositório. Só o `provedorPadrao` (que projeto usa o
 * gateway) é do projeto.
 */
async function conectar(args: string[], dirProjeto: string): Promise<void> {
  const baseUrl = valorDeFlag(args, "--url");
  const chave = valorDeFlag(args, "--chave");
  const modelo = valorDeFlag(args, "--modelo");

  if (!baseUrl && !chave && !modelo) {
    // Sem argumentos: mostra o que já está configurado, sem revelar a chave.
    const resumo = resumirCredencial((await lerCredenciais())[ID_PROVEDOR_GATEWAY]);
    if (!resumo.configurado) {
      console.log("Nenhum gateway configurado.");
      console.log("uso: gerador ia conectar --url <base-url> --chave <chave> --modelo <nome-do-modelo>");
      return;
    }
    console.log(`Gateway: ${resumo.baseUrl}`);
    console.log(`Modelo:  ${resumo.modelo}`);
    console.log(`Chave:   ${resumo.chaveMascarada}`);
    return;
  }

  if (!baseUrl || !chave || !modelo) {
    throw new Error("uso: gerador ia conectar --url <base-url> --chave <chave> --modelo <nome-do-modelo>");
  }

  await salvarCredencial(ID_PROVEDOR_GATEWAY, { baseUrl, chave, modelo });
  await gravarProvedor(ID_PROVEDOR_GATEWAY, dirProjeto);
  console.log(`Gateway conectado: ${modelo} em ${baseUrl}.`);
  console.log("A chave ficou em ~/.gerador/credenciais.json (fora do repositório).");
}

async function status(dirProjeto: string): Promise<void> {
  const st = await verificarStatus(undefined, await provedorSelecionado(dirProjeto));
  console.log(`Diretório de modelos: ${st.caminhoModelos}\n`);
  for (const m of st.modelosChat) {
    const marca = m.instalado ? "✓" : "✗";
    const selo = m.selecionado ? " ← em uso" : "";
    // Provedor remoto não tem tamanho nem download: o que interessa é se a
    // credencial está lá, e qual gateway/modelo é.
    const detalhe = m.remoto
      ? st.gateway.configurado
        ? `${st.gateway.modelo} em ${st.gateway.baseUrl} (chave ${st.gateway.chaveMascarada})`
        : "sem credencial — `gerador ia conectar`"
      : `~${formatarMB(m.tamanhoAproximadoBytes)}${m.raciocinador ? ", raciocinador" : ""}`;
    console.log(`  ${marca} ${m.id} — ${m.papel} (${detalhe})${selo}`);
  }
  console.log(`  ${st.embeddingInstalado ? "✓" : "✗"} embedding — necessário pro RAG (e pra IA local ficar pronta)`);
  console.log();
  if (st.pronto) {
    console.log(st.provedor === ID_PROVEDOR_GATEWAY ? "IA pronta pra uso via gateway." : "IA local pronta pra uso.");
  } else {
    console.log(
      st.provedor === ID_PROVEDOR_GATEWAY
        ? "Gateway selecionado sem credencial — rode `gerador ia conectar`."
        : "IA local não instalada — rode `gerador ia instalar`."
    );
  }
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
    case "conectar":
      await conectar(args, dirProjeto);
      return;
    case "status":
      await status(dirProjeto);
      return;
    default:
      throw new Error(
        "uso: gerador ia <instalar [--modelo <id>]|usar <id>|conectar --url <base> --chave <chave> --modelo <nome>|status>"
      );
  }
}
