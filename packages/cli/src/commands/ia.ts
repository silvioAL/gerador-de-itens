import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ID_PROVEDOR_GATEWAY,
  MODELOS_CHAT,
  MODELOS_PADRAO,
  MODELO_CHAT,
  baixarModelo,
  buscarComProxy,
  detectarProxy,
  explicarFalhaDeRede,
  explicarRespostaRecusada,
  origensCandidatas,
  idsDeProvedorValidos,
  instalarDeArquivoLocal,
  instalarDePartesNpm,
  instalarDeUrls,
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

/**
 * SPEC-32 — de onde o modelo vem quando o Hugging Face não é uma opção.
 *
 * `--de <caminho>` copia um .gguf que já existe; `--origem npm` monta o modelo
 * a partir dos pacotes-parte publicados. As duas existem pelo mesmo motivo
 * concreto: a rede onde a ferramenta precisa rodar bloqueia o Hugging Face, e
 * um download que não completa não é lentidão — é a ferramenta indisponível.
 */
async function instalarUm(modelo: ModeloRegistrado, de: string | undefined, origem: string | undefined): Promise<void> {
  const inicio = Date.now();
  let ultimo = -1;
  const relatar = (feito: number, total: number | undefined, etapa: string) => {
    if (!total) return;
    const percentual = Math.floor((feito / total) * 100);
    if (percentual === ultimo) return;
    ultimo = percentual;
    // `\r` e não `\n`: a barra reescreve a MESMA linha. Com quebra de linha,
    // um download de 2,5 GB vira centenas de linhas de log.
    process.stdout.write(`\r  ${etapa} ${percentual}% (${formatarMB(feito)} / ${formatarMB(total)})`);
  };

  console.log(`${modelo.papel}...`);
  if (de) {
    await instalarDeArquivoLocal(modelo, de, {
      onProgresso: ({ bytesEscritos, bytesTotais }) => relatar(bytesEscritos, bytesTotais, "copiando"),
    });
  } else if (origem === "npm") {
    await instalarDePartesNpm(modelo, {
      onProgresso: ({ bytesEscritos, bytesTotais, etapa }) => relatar(bytesEscritos, bytesTotais, etapa),
    });
  } else if (origem === "huggingface" || !modelo.partesUrl?.length) {
    await baixarModelo(modelo, {
      onProgresso: ({ bytesBaixados, bytesTotais }) => relatar(bytesBaixados, bytesTotais, "baixando"),
    });
  } else {
    // Release do GitHub como PADRAO, Hugging Face como reserva — e nao o
    // contrario. Medido em campo: o filtro corporativo classifica o Hugging
    // Face como *file sharing* e devolve 403, enquanto libera o GitHub. O
    // mirror e byte a byte identico (mesmo SHA-256, conferido nos dois
    // caminhos), entao preferir o que funciona em mais redes nao custa nada.
    //
    // A reserva existe pro caso oposto: rede que libera o Hugging Face e
    // bloqueia o GitHub. Nenhuma das duas e universal.
    try {
      await instalarDeUrls(modelo, {
        onProgresso: ({ bytesEscritos, bytesTotais }) => relatar(bytesEscritos, bytesTotais, "baixando"),
      });
    } catch (erro) {
      console.log(`  release indisponivel (${erro instanceof Error ? erro.message.slice(0, 120) : erro}); tentando o Hugging Face...`);
      await baixarModelo(modelo, {
        onProgresso: ({ bytesBaixados, bytesTotais }) => relatar(bytesBaixados, bytesTotais, "baixando"),
      });
    }
  }

  const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(`\r  concluído em ${segundos}s.                                        `);
}

interface OpcoesInstalar {
  idModelo?: string;
  /** Caminho de um .gguf que já existe nesta máquina. */
  de?: string;
  /** "npm" monta o modelo pelos pacotes-parte; ausente = Hugging Face. */
  origem?: string;
}

async function instalar({ idModelo, de, origem }: OpcoesInstalar = {}): Promise<void> {
  if (idModelo) {
    const modelo = modeloPorId(idModelo);
    if (!modelo) {
      const ids = MODELOS_CHAT.map((m) => m.id).join(", ");
      throw new Error(`modelo desconhecido: ${idModelo}. Disponíveis: ${ids}`);
    }
    console.log(`Instalando ${modelo.nome} (~${formatarMB(modelo.tamanhoAproximadoBytes)}) — só na primeira vez.\n`);
    await instalarUm(modelo, de, origem);
    console.log(`\nPronto. Use com \`gerador ia usar ${modelo.id}\`.`);
    return;
  }

  if (de) {
    // Um caminho de arquivo só pode ser UM modelo. Aceitar isso calado
    // instalaria o mesmo .gguf sob dois nomes diferentes — e o erro apareceria
    // muito depois, na forma "o embedding não funciona".
    throw new Error(
      "--de instala um modelo por vez. Diga qual: gerador ia instalar --modelo qwen-local --de <caminho>"
    );
  }
  console.log("Instalando modelos de IA local (Qwen3-4B + Qwen3-Embedding-0.6B) — só na primeira vez.\n");
  for (const modelo of MODELOS_PADRAO) {
    // eslint-disable-next-line no-await-in-loop -- instalar um modelo de cada vez é intencional: dois downloads
    // grandes em paralelo competem pela mesma banda e só deixam a barra de progresso dos dois mais confusa.
    await instalarUm(modelo, undefined, origem);
  }
  console.log("\nPronto. Rode `gerador ia status` pra conferir.");
}

/**
 * Testa UMA origem, do jeito que o download real testaria.
 *
 * Nunca deixa uma origem derrubar o diagnóstico: o valor do comando é o
 * panorama completo, e uma origem que estoura é justamente o dado que se quer
 * ver — não motivo pra parar antes das outras.
 */
async function testarOrigem(url: string): Promise<{ ok: boolean; detalhe: string }> {
  const inicio = Date.now();
  try {
    const r = await buscarComProxy(url, { method: "HEAD" });
    const ms = Date.now() - inicio;
    // ACHADO da propria validacao: a primeira versao marcava ✗ pra tudo que
    // nao fosse 200 — e um 404 virava "bloqueado". Errado: 404 e o host
    // RESPONDENDO, ou seja, a rede deixou passar. O que caracteriza bloqueio e
    // 403/407, que e como o filtro corporativo recusa. Confundir os dois daria
    // exatamente o falso negativo que este comando existe pra evitar.
    const bloqueado = r.status === 403 || r.status === 407;
    return {
      ok: !bloqueado,
      detalhe: `HTTP ${r.status} em ${ms}ms${bloqueado ? " — recusado pelo filtro" : r.ok ? "" : " (host respondeu: a rede passa)"}`,
    };
  } catch (erro) {
    const causa = (erro as { cause?: { code?: string } })?.cause?.code;
    return { ok: false, detalhe: causa ?? (erro instanceof Error ? erro.message : String(erro)) };
  }
}

/**
 * SPEC-32 — diz por que o download falhou, nesta maquina, agora.
 *
 * Existe por um motivo concreto: o usuario recebeu `fetch failed` e a leitura
 * facil foi "a rede bloqueia o Hugging Face". Tres palavras nao sustentam essa
 * conclusao — e agir sobre ela custou um caminho inteiro construido antes de
 * alguem olhar o `error.cause`. Este comando existe pra ninguem mais precisar
 * adivinhar: ele tenta de verdade e mostra o que voltou.
 */
async function diagnosticar(): Promise<void> {
  const url = `https://huggingface.co/${MODELO_CHAT.repositorioHuggingFace}/resolve/main/${MODELO_CHAT.nomeArquivo}`;
  const proxy = detectarProxy();

  console.log(`Node:  ${process.version}`);
  console.log(`Proxy: ${proxy ? `${proxy.url} (de ${proxy.origem})` : "nenhum configurado"}`);
  console.log(`NO_PROXY: ${process.env.NO_PROXY ?? process.env.no_proxy ?? "(vazio)"}`);
  console.log(`NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS ?? "(vazio)"}`);
  // Testa TODAS as origens possíveis, não só a padrão. Numa rede corporativa
  // "tem internet" não é resposta: o filtro libera por categoria, e o Hugging
  // Face costuma cair em "file sharing" enquanto o npm passa como "developer
  // tools". Qual delas passa é pergunta empírica, e quem sabe responder é a
  // máquina de quem usa — não a minha suposição.
  console.log("\nOrigens possíveis para o modelo:");
  for (const origem of origensCandidatas(MODELO_CHAT.repositorioHuggingFace, MODELO_CHAT.nomeArquivo)) {
    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito: em
    // paralelo, um proxy lento faz os tempos medidos mentirem uns sobre os outros.
    const r = await testarOrigem(origem.url);
    console.log(`  ${r.ok ? "✓" : "✗"} ${origem.nome.padEnd(24)} ${r.detalhe}`);
    if (r.ok) console.log(`      → ${origem.saida}`);
  }

  console.log(`\nDetalhe do destino padrão (${new URL(url).host}):`);

  const inicio = Date.now();
  try {
    // HEAD e suficiente: o que se testa e alcancar o host, nao baixar 2,5 GB.
    const r = await buscarComProxy(url, { method: "HEAD" });
    const ms = Date.now() - inicio;
    console.log(`  HTTP ${r.status} em ${ms}ms — tamanho anunciado: ${r.headers.get("content-length") ?? "?"} bytes`);
    if (r.ok) {
      console.log("\nA rede alcança o modelo. `gerador ia instalar` deve funcionar.");
    } else {
      // "O host respondeu, mas recusou o arquivo" não dizia NADA acionável.
      // Um 403 com corpo HTML é a página de bloqueio do filtro corporativo, e
      // o título dela costuma nomear a política — que é exatamente o que a
      // infraestrutura precisa pra liberar. O HEAD não traz corpo; por isso o
      // GET aqui, só neste caminho de falha.
      const comCorpo = await buscarComProxy(url, { method: "GET" }).catch(() => r);
      console.log(`\n${(await explicarRespostaRecusada(comCorpo, MODELO_CHAT.nomeArquivo)).message}`);
    }
  } catch (erro) {
    console.log(`  falhou em ${Date.now() - inicio}ms\n`);
    console.log(explicarFalhaDeRede(erro, url).message);
  }
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
    case "diagnosticar":
      await diagnosticar();
      break;
    case "instalar":
      await instalar({
        idModelo: valorDeFlag(args, "--modelo"),
        de: valorDeFlag(args, "--de"),
        origem: valorDeFlag(args, "--origem"),
      });
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
        "uso: gerador ia <diagnosticar|instalar [--modelo <id>] [--de <caminho.gguf>] [--origem npm|huggingface]|usar <id>|conectar --url <base> --chave <chave> --modelo <nome>|status>"
      );
  }
}
