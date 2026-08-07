# gerador-de-itens

CLI do Gerador de Itens — 100% local, sem servidor (SPEC-17). Deriva um backlog técnico deterministicamente a partir de um diagrama de arquitetura, e materializa referências/padrões de time como notas Obsidian.

## Instalar

```powershell
npm install -g gerador-de-itens
```

Publicado no [npm](https://www.npmjs.com/package/gerador-de-itens) — mesmo mecanismo do Graphify (`npm install -g @sentropic/graphify` / `pip install graphifyy`): o comando baixa o pacote já compilado direto do registry, com as dependências resolvidas, sem precisar clonar o repositório. Comando fica disponível como `gerador` em qualquer diretório.

### Instalar a partir do código (contribuindo ou testando uma mudança local)

```powershell
# de dentro do repositório clonado
npm install
npm run build --workspace=packages/cli
npm link --workspace=packages/cli   # aponta pro código do repo, atualiza a cada rebuild
```

## Uso

```powershell
cd algum-projeto
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
| `open` | Sobe o editor visual local (empacotado no próprio pacote), servindo `config/` do diretório atual |
| `import-graphify <graph.json>` | Rascunho de `quebra.json` a partir de um grafo já extraído pelo Graphify |
| `export-vault` | Materializa `config/referencias/*.json` + padrões default como notas Obsidian (SPEC-16/17) |

Todos os comandos são locais — nenhum depende de rede ou de um servidor externo. `open` funciona a partir do pacote instalado via npm, em qualquer diretório: o editor visual vai empacotado dentro de `gerador-de-itens` (`web-dist/`), e o próprio `gerador open` sobe uma API mínima sem login (sessão fixa, sem conceito de time) que persiste cada quebra salva no canvas em `quebras/<id>.json` — um arquivo por quebra, então "Nova quebra" nunca sobrescreve a anterior. O canvas exige um título antes de salvar, exatamente pra essas quebras serem achável depois na tela "Abrir…" (busca por título/time, filtro por data de criação). Passe o caminho de um desses arquivos pra `derive`/`implementar` continuar pelo terminal. Perfis de time, referências e campos por tipo de nó lidos/escritos ali vão direto pra `config/perfis-time.json`/`config/referencias/*.json`/`config/campos-no.json`.

## Licença

MIT.
