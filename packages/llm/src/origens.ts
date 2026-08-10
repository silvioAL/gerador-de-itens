import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { caminhoDoModelo, garantirDiretorioDeModelos } from "./cache.js";
import type { ModeloRegistrado } from "./modelos.js";

const execArquivo = promisify(execFile);

/**
 * SPEC-32 — de onde o modelo vem, quando o Hugging Face não é uma opção.
 *
 * O motivo é concreto: a rede onde a ferramenta precisa rodar bloqueia o
 * Hugging Face. Download que não completa não é download lento — é a
 * ferramenta indisponível.
 *
 * Duas origens novas, com públicos diferentes:
 *
 * - `arquivoLocal` destrava UMA pessoa hoje, sem publicar nada: o GGUF já
 *   existe em algum lugar (pendrive, share, a máquina de quem baixou antes).
 * - `npmPartes` resolve o TIME, pelo único canal que a rede corporativa
 *   costuma liberar.
 *
 * E a parede que o desenho respeita: **um pacote npm de 2,5 GB não publica**.
 * Um pacote de 229,9 MB já levou `413 Payload Too Large` no npmjs.org e o
 * maior real publicado que achamos tem 258 MB. Por isso partes, não um pacote.
 */

export interface ProgressoInstalacao {
  modelo: ModeloRegistrado;
  bytesEscritos: number;
  bytesTotais: number | undefined;
  /** Qual passo está rodando — a instalação por partes tem duas fases bem
   * diferentes em duração, e uma barra só faria parecer travado. */
  etapa: "baixando" | "montando" | "verificando";
}

export interface OpcoesInstalacao {
  onProgresso?: (progresso: ProgressoInstalacao) => void;
  baseDir?: string;
  /** Só testes — evita rodar `npm` de verdade. */
  execImpl?: (comando: string, args: string[]) => Promise<unknown>;
  /** As partes já vieram como dependência do pacote (modelo embarcado): lê do
   * `node_modules` em vez de rodar `npm install` num prefixo temporário. */
  jaInstaladas?: boolean;
  /** Só testes/embarcado — resolve o diretório de um pacote-parte. */
  resolverParte?: (pacote: string) => string | undefined;
}

/**
 * Copia um GGUF que já existe para o cache local.
 *
 * Escreve num `.part` e só renomeia no fim, mesma disciplina do download
 * (`download.ts`): sem isso, uma cópia interrompida deixaria um arquivo com o
 * nome certo e conteúdo pela metade, e `verificarStatus()` — que checa
 * existência — mentiria dizendo "instalado".
 */
export async function instalarDeArquivoLocal(
  modelo: ModeloRegistrado,
  caminhoOrigem: string,
  opcoes: OpcoesInstalacao = {}
): Promise<string> {
  if (!existsSync(caminhoOrigem)) {
    throw new Error(
      `Não encontrei "${caminhoOrigem}". Passe o caminho do arquivo .gguf, não o da pasta — ex.: gerador ia instalar --de D:\\modelos\\${modelo.nomeArquivo}`
    );
  }

  const info = await stat(caminhoOrigem);
  if (info.isDirectory()) {
    throw new Error(
      `"${caminhoOrigem}" é uma pasta. Aponte para o arquivo: ${join(caminhoOrigem, modelo.nomeArquivo)}`
    );
  }

  // Tamanho MUITO fora do esperado quase sempre é o arquivo errado (um .gguf
  // de outro modelo, ou um HTML de erro salvo com o nome errado). Avisar aqui
  // custa nada; descobrir depois custa uma sessão inteira achando que o modelo
  // é ruim. Tolerância larga de propósito — quantizações diferentes variam.
  const esperado = modelo.tamanhoAproximadoBytes;
  if (info.size < esperado * 0.5 || info.size > esperado * 2) {
    throw new Error(
      `"${caminhoOrigem}" tem ${mb(info.size)} MB, mas ${modelo.nomeArquivo} deveria ter perto de ${mb(esperado)} MB. Confira se é o arquivo certo.`
    );
  }

  await garantirDiretorioDeModelos(opcoes.baseDir);
  const destino = caminhoDoModelo(modelo, opcoes.baseDir);
  if (existsSync(destino)) return destino;
  const parcial = `${destino}.part`;

  let bytesEscritos = 0;
  const origem = createReadStream(caminhoOrigem);
  origem.on("data", (pedaco: Buffer | string) => {
    bytesEscritos += pedaco.length;
    opcoes.onProgresso?.({ modelo, bytesEscritos, bytesTotais: info.size, etapa: "baixando" });
  });

  try {
    await pipeline(origem, createWriteStream(parcial));
  } catch (erro) {
    await rm(parcial, { force: true });
    throw erro;
  }

  await conferirHashSeHouver(modelo, parcial, opcoes);
  await rename(parcial, destino);
  return destino;
}

/**
 * Instala o modelo a partir dos pacotes-parte publicados no npm.
 *
 * Quem baixa é o **próprio `npm install`**, num prefixo descartável — não um
 * cliente HTTP nosso. Isso não é preguiça: é o que faz o caminho funcionar numa
 * rede corporativa. O `npm` já sabe ler `.npmrc`, proxy, registry espelhado
 * (Artifactory/Nexus) e credencial. Reimplementar isso seria reimplementar
 * todos os jeitos de errar.
 */
export async function instalarDePartesNpm(
  modelo: ModeloRegistrado,
  opcoes: OpcoesInstalacao = {}
): Promise<string> {
  const pacotes = modelo.partesNpm;
  if (!pacotes?.length) {
    throw new Error(
      `${modelo.nome} não tem pacotes-parte publicados. Use --de <caminho do .gguf> para instalar de um arquivo local.`
    );
  }

  await garantirDiretorioDeModelos(opcoes.baseDir);
  const destino = caminhoDoModelo(modelo, opcoes.baseDir);
  if (existsSync(destino)) return destino;

  // Modelo embarcado (SPEC-32): as partes vieram como dependência, então não
  // há o que baixar — só remontar. Pular o `npm install` aqui não é
  // otimização: rodar `npm` de dentro de um `gerador open` seria lento,
  // barulhento e poderia falhar por politica de rede, pra buscar algo que já
  // está no disco.
  const prefixo = opcoes.jaInstaladas ? "" : await mkdtemp(join(tmpdir(), "gerador-modelo-"));
  const exec = opcoes.execImpl ?? ((c: string, a: string[]) => execArquivo(c, a, { maxBuffer: 32 * 1024 * 1024 }));

  try {
    if (opcoes.jaInstaladas) {
      opcoes.onProgresso?.({ modelo, bytesEscritos: 0, bytesTotais: modelo.tamanhoAproximadoBytes, etapa: "montando" });
    } else {
    opcoes.onProgresso?.({ modelo, bytesEscritos: 0, bytesTotais: modelo.tamanhoAproximadoBytes, etapa: "baixando" });
    // `--no-save`/`--no-audit`/`--no-fund`: é um prefixo descartável, não um
    // projeto. `--prefix` mantém tudo fora do node_modules de quem instalou a
    // ferramenta — o modelo não é dependência de código, é dado.
    await exec(comandoNpm(), ["install", "--prefix", prefixo, "--no-save", "--no-audit", "--no-fund", ...pacotes]);
    }
  } catch (erro) {
    if (prefixo) await rm(prefixo, { recursive: true, force: true });
    throw new Error(
      `Falha ao buscar as partes do modelo no npm: ${erro instanceof Error ? erro.message.slice(0, 300) : erro}. ` +
        `Se o registry da sua rede não tem esses pacotes, use --de <caminho do .gguf>.`
    );
  }

  const parcial = `${destino}.part`;
  try {
    // Ordem por posição na lista, NUNCA pela ordem que o disco devolve:
    // `readdir` não promete ordenação, e parte fora de ordem produz um arquivo
    // do tamanho certo e conteúdo errado — o pior tipo de falha, porque o
    // sintoma (modelo gerando lixo) aparece longe da causa.
    const saida = createWriteStream(parcial);
    let bytesEscritos = 0;
    for (const pacote of pacotes) {
      const dir = opcoes.jaInstaladas
        ? opcoes.resolverParte?.(pacote)
        : join(prefixo, "node_modules", ...pacote.split("/"));
      if (!dir) throw new Error(`A parte ${pacote} não foi encontrada — reinstale a ferramenta.`);
      const arquivo = await acharArquivoDaParte(dir);
      const leitura = createReadStream(arquivo);
      leitura.on("data", (pedaco: Buffer | string) => {
        bytesEscritos += pedaco.length;
        opcoes.onProgresso?.({
          modelo,
          bytesEscritos,
          bytesTotais: modelo.tamanhoAproximadoBytes,
          etapa: "montando",
        });
      });
      await pipeline(leitura, saida, { end: false });
    }
    // Esperar o `finish`, e não só chamar `end()`: o hash abaixo LÊ o arquivo
    // que acabou de ser escrito. Com o buffer pequeno de um teste o flush
    // acontece a tempo e a corrida não aparece — com 2,5 GB reais, apareceria,
    // e o sintoma seria "chegou corrompido" num arquivo que estava certo.
    await new Promise<void>((resolver, rejeitar) => {
      saida.once("finish", resolver);
      saida.once("error", rejeitar);
      saida.end();
    });

    opcoes.onProgresso?.({ modelo, bytesEscritos, bytesTotais: bytesEscritos, etapa: "verificando" });
    await conferirHashSeHouver(modelo, parcial, opcoes);
    await rename(parcial, destino);
    return destino;
  } catch (erro) {
    await rm(parcial, { force: true });
    throw erro;
  } finally {
    if (prefixo) await rm(prefixo, { recursive: true, force: true });
  }
}

/**
 * A SPEC-23 registrou que a integridade era conferida **só por tamanho**, com
 * hash como "evolução futura". Com remontagem de partes isso deixou de ser
 * aceitável: parte fora de ordem, parte de versão antiga ou download truncado
 * dão um arquivo do tamanho certo e do conteúdo errado.
 *
 * Continua opcional no tipo porque os modelos vindos do Hugging Face ainda não
 * têm hash registrado — mas quando existe, é conferido, e quem publica partes
 * é obrigado a preencher (o script de fatiamento calcula).
 */
async function conferirHashSeHouver(
  modelo: ModeloRegistrado,
  caminho: string,
  opcoes: OpcoesInstalacao
): Promise<void> {
  if (!modelo.sha256) return;
  opcoes.onProgresso?.({ modelo, bytesEscritos: 0, bytesTotais: undefined, etapa: "verificando" });

  const hash = createHash("sha256");
  await pipeline(createReadStream(caminho), hash);
  const obtido = hash.digest("hex");

  if (obtido !== modelo.sha256) {
    await rm(caminho, { force: true });
    throw new Error(
      `${modelo.nomeArquivo} chegou corrompido (sha256 ${obtido.slice(0, 12)}… em vez de ${modelo.sha256.slice(0, 12)}…). ` +
        `Nada foi instalado — rode de novo.`
    );
  }
}

/** O pacote-parte tem UM arquivo de dados; achar por extensão evita fixar o
 * nome em dois lugares (aqui e no script que gera os pacotes). */
async function acharArquivoDaParte(dirPacote: string): Promise<string> {
  const entradas = await readdir(dirPacote).catch(() => {
    throw new Error(`O pacote em ${dirPacote} não foi instalado como esperado.`);
  });
  const parte = entradas.find((e) => e.endsWith(".bin"));
  if (!parte) throw new Error(`O pacote em ${dirPacote} não contém a parte (.bin) do modelo.`);
  return join(dirPacote, parte);
}

/** No Windows o executável é `npm.cmd`; `execFile` não resolve `.cmd` sozinho. */
function comandoNpm(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function mb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}
