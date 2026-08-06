# @gerador/cli

CLI do Gerador de Itens — 100% local, sem servidor (SPEC-17). Deriva um backlog técnico deterministicamente a partir de um diagrama de arquitetura, e materializa referências/padrões de time como notas Obsidian.

## Instalar globalmente

Não é publicado num registry (é uma ferramenta pessoal/de time, não um pacote open source) — instala-se direto a partir do repositório clonado:

```powershell
# de dentro do repositório
npm install
npm run build --workspace=packages/cli

# opção 1: link (aponta pro código do repo, atualiza sozinho a cada rebuild)
npm link --workspace=packages/cli

# opção 2: pacote local (uma cópia fixa, não muda se o repo mudar)
npm pack --workspace=packages/cli
npm install -g gerador-cli-0.1.0.tgz
```

Depois disso, `gerador` fica disponível em qualquer diretório, sem precisar mais estar dentro do repositório:

```powershell
cd algum-outro-projeto
gerador init
gerador derive quebra.json --out backlog.md
```

## Comandos

Veja `gerador --help` para a lista completa e atualizada. Resumo:

| Comando | O que faz |
|---|---|
| `init [diretório]` | Cria `config/` de exemplo (nunca sobrescreve) |
| `derive <quebra.json>` | Deriva o backlog a partir da quebra + `config/` do diretório atual |
| `implementar <quebra.json>` | Especificação de entrega da quebra inteira (SPEC-14) |
| `open` | Sobe o editor visual local, servindo `config/` do diretório atual |
| `import-graphify <graph.json>` | Rascunho de `quebra.json` a partir de um grafo já extraído pelo Graphify |
| `export-vault` | Materializa `config/referencias/*.json` + padrões default como notas Obsidian (SPEC-16/17) |

Todos os comandos são locais — nenhum depende de rede ou de um servidor rodando.

**Limitação conhecida do `open`:** ele serve o build estático de `packages/web` a partir de um caminho relativo dentro do monorepo (`../../web/dist`, ao lado de `packages/cli`) — funciona rodando o CLI de dentro deste repositório clonado, mas ainda não funciona a partir de uma instalação global fora dele (o build do editor visual não está empacotado dentro de `@gerador/cli`). `derive`/`implementar`/`init`/`import-graphify`/`export-vault` não têm essa limitação. Empacotar o editor visual junto fica pra uma rodada futura (Fase H do plano).
