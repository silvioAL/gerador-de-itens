# gerador-de-itens

CLI do Gerador de Itens — 100% local, sem servidor (SPEC-17). Deriva itens de trabalho deterministicamente a partir de um diagrama de arquitetura, e gera uma especificação de solução única (markdown) pronta pra ser o input de outro agente.

## Instalar

```powershell
npm install -g gerador-de-itens --allow-scripts=node-llama-cpp
```

Publicado no [npm](https://www.npmjs.com/package/gerador-de-itens) — mesmo mecanismo do Graphify (`npm install -g @sentropic/graphify` / `pip install graphifyy`): o comando baixa o pacote já compilado direto do registry, com as dependências resolvidas, sem precisar clonar o repositório. Comando fica disponível como `gerador` em qualquer diretório.

`--allow-scripts=node-llama-cpp` deixa o `npm` (versões recentes bloqueiam postinstall por padrão) rodar o postinstall do [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) (motor de IA local, SPEC-23), que instala corretamente o binário nativo pra sua plataforma. Sem essa flag, o binário fica num estado que o Windows Defender pode sinalizar como "app bloqueado" ao ser carregado — todo o resto da ferramenta (`init`/`derive`/`implementar`/`open`/`import-graphify`, incluindo `gerador ia instalar`/`status`, que só baixam/checam arquivo) continua funcionando normalmente; só a chamada de verdade ao modelo (botão "✨ Sugerir" na revisão) fica indisponível.

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
gerador derive quebra.json --out itens.md
```

## Comandos

Veja `gerador --help` para a lista completa e atualizada. Resumo:

| Comando | O que faz |
|---|---|
| `init [diretório]` | Cria `config/` de exemplo (nunca sobrescreve) |
| `derive <quebra.json>` | Deriva os itens a partir da quebra + `config/` do diretório atual |
| `implementar <quebra.json>` | Especificação de solução da quebra inteira (SPEC-14) |
| `open` | Sobe o editor visual local (empacotado no próprio pacote), servindo `config/` do diretório atual |
| `import-graphify <graph.json>` | Rascunho de `quebra.json` a partir de um grafo já extraído pelo Graphify |

Todos os comandos são locais — nenhum depende de rede ou de um servidor externo. `open` funciona a partir do pacote instalado via npm, em qualquer diretório: o editor visual vai empacotado dentro de `gerador-de-itens` (`web-dist/`), e o próprio `gerador open` sobe uma API mínima sem login (sessão fixa, sem conceito de time) que persiste cada quebra salva no canvas em `quebras/<id>.json` — um arquivo por quebra, então "Nova quebra" nunca sobrescreve a anterior. O canvas exige um título antes de salvar, exatamente pra essas quebras serem achável depois na tela "Abrir…" (busca por título/time, filtro por data de criação). Passe o caminho de um desses arquivos pra `derive`/`implementar` continuar pelo terminal. Perfis de time e campos por tipo de nó lidos/escritos ali vão direto pra `config/perfis-time.json`/`config/campos-no.json`.

## Licença

MIT.
