import { init } from "./commands/init.js";
import { derive } from "./commands/derive.js";
import { open } from "./commands/open.js";
import { importGraphify } from "./commands/importGraphify.js";
import { implementar } from "./commands/implementar.js";
import { exportVault } from "./commands/exportVault.js";
import { skillInstall } from "./commands/skillInstall.js";

const AJUDA = `Uso: gerador <comando> [opções]

Comandos:
  init [diretório]         Cria config/ de exemplo (não sobrescreve o que já existir)
  derive <quebra.json>     Deriva o backlog a partir de uma quebra e config/ do diretório atual
    --out <arquivo>        Grava em vez de imprimir (extensão decide .md ou .csv)
  implementar <quebra.json>   Especificação de entrega da quebra inteira (SPEC-14):
                            um documento com todos os itens, especificação técnica + refinamento
    --out <arquivo>        Grava em vez de imprimir
  open                     Sobe um servidor local servindo o app já buildado (packages/web/dist)
    --port <porta>         Padrão: 4321
  import-graphify <graph.json>   Rascunho de quebra.json a partir de um grafo já extraído pelo Graphify
    --out <arquivo>        Padrão: quebra-rascunho.json
  export-vault             Materializa referências (config/referencias/*.json) + padrões default
                            como notas Obsidian (SPEC-16/17) — 100% local, sem servidor
                            Pré-requisito: rodar "graphify export obsidian" antes, no mesmo vault
    --dir <vault>          Padrão: graphify-out/obsidian
    --vault-nome <nome>    Nome do vault registrado no Obsidian. Padrão: nome da pasta de --dir
    --abrir                Abre o vault direto no Obsidian depois de gerar as notas
  skill-install [destino]  Instala a skill do Claude Code no projeto atual
                            Padrão: .claude/skills/gerador-de-itens
`;

async function main(): Promise<void> {
  const [, , comando, ...resto] = process.argv;

  switch (comando) {
    case "init":
      await init(resto);
      return;
    case "derive":
      await derive(resto);
      return;
    case "implementar":
      await implementar(resto);
      return;
    case "open":
      await open(resto);
      return;
    case "import-graphify":
      await importGraphify(resto);
      return;
    case "export-vault":
      await exportVault(resto);
      return;
    case "skill-install":
      await skillInstall(resto);
      return;
    case "help":
    case "--help":
    case undefined:
      console.log(AJUDA);
      return;
    default:
      console.error(`Comando desconhecido: "${comando}"\n`);
      console.log(AJUDA);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
