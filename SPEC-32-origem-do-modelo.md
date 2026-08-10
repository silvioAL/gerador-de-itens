# SPEC-32 — De onde o modelo vem

## 1. Objetivo

Tirar o Hugging Face do caminho crítico. O modelo local passa a ter **origem
plugável**: Hugging Face (como hoje), **arquivo local** e **pacotes npm**.

## 2. O que motivou

A SPEC-23 registrou, na Fase 0, a decisão de **não** embutir o modelo no pacote
npm — *"download sob demanda (não bundlado no pacote npm, ~3GB é grande
demais)"*. O critério ali era tamanho.

Apareceu um critério mais forte: **a rede onde a ferramenta precisa rodar
bloqueia o Hugging Face.** Um download que não completa não é um download
lento — é a ferramenta inteira indisponível. O pedido do usuário foi explícito:
*"melhor ter um build maior e conseguir usar"*.

Isso não invalida o argumento de tamanho; ele continua verdadeiro. O que muda é
que ele deixou de ser o critério dominante.

## 3. A parede que o desenho tem que respeitar

**Um pacote npm de 2,5 GB não publica.** Medido, não estimado:

| Evidência | Valor |
|---|---|
| `413 Payload Too Large` relatado no npmjs.org | pacote de **229,9 MB** |
| Maior pacote real que encontramos publicado (`onnxruntime-node`) | **258,3 MB** |
| Limite do GitHub Packages (documentado) | **256 MB** |
| Qwen3-4B-Q4_K_M | **2.497 MB** |

Ou seja: "embutir o modelo no pacote" no sentido literal — um `files: ["modelo.gguf"]`
— **não existe**. Qualquer desenho que dependa disso falha no `npm publish`, não
em produção, o que pelo menos é cedo.

Registrado porque é contraintuitivo: o npm parece um lugar razoável pra guardar
um binário grande, e não é. O teto não está documentado numa página oficial —
ele aparece como 413 na hora do publish.

## 4. Decisão

`ModeloRegistrado` deixa de embutir a URL do Hugging Face. Ganha uma **origem**:

```ts
type OrigemModelo =
  | { tipo: "huggingface"; repositorio: string; arquivo: string }
  | { tipo: "arquivoLocal"; caminho: string }
  | { tipo: "npmPartes"; pacotes: string[] };
```

### 4.1 `arquivoLocal` — o destravamento imediato

`gerador ia instalar --de <caminho>` copia um GGUF que já existe (pendrive,
share de rede, a máquina de quem baixou antes) para `~/.gerador/models`.

Não precisa publicar nada, não precisa de rede, e funciona hoje. É o caminho
para *uma* pessoa destravar; não resolve time.

### 4.2 `npmPartes` — o que resolve o time

O GGUF é fatiado em partes de ~200 MB, cada parte é **um pacote npm**, e
`gerador ia instalar` monta o arquivo de volta.

A instalação das partes é feita pelo **próprio `npm install`**, num prefixo
descartável — não por um cliente HTTP nosso. Isso não é preguiça: é o que faz
o caminho funcionar numa rede corporativa. `npm` já sabe ler o `.npmrc`, o
proxy, o registry espelhado (Artifactory/Nexus) e a credencial. Reimplementar
isso significaria reimplementar todos os jeitos de errar.

### 4.3 Hash deixa de ser opcional

A SPEC-23 registrou que a verificação de integridade era *só por tamanho*, com
hash "como possível evolução futura". Com remontagem de partes isso deixa de
ser aceitável: partes fora de ordem, uma parte de versão antiga, ou um download
truncado produzem um arquivo **do tamanho certo e do conteúdo errado** — e o
sintoma seria o modelo gerando lixo, longe da causa.

Cada parte carrega o SHA-256 dela, e o manifesto carrega o SHA-256 do arquivo
inteiro. As duas são conferidas.

## 5. O que NÃO muda

- O Hugging Face continua sendo a origem padrão de quem tem acesso a ele. Nada
  do que funciona hoje é removido — origem nova é aditiva.
- O modo hospedado (Docker + Ollama) não é afetado: lá o modelo vem pelo
  `ollama pull`, e o `--profile ia` já resolve.
- O modelo de embedding (650 MB) segue exigido pelo `pronto` do
  `verificarStatus`, mas serve só ao RAG de retrospectivas — vale revisitar se
  ele deve mesmo bloquear o "pronto", já que hoje o RAG não é o caminho usado.

## 6. O que fica registrado como custo, não como problema resolvido

Publicar ~2,5 GB de modelo fatiado no registry **público** do npm é um uso
incomum do registry. O Qwen3-4B é Apache-2.0, então redistribuir é permitido
com atribuição — a questão não é licença, é que o npm não é um object storage e
pode tratar isso como abuso. Se acontecer, a saída é um registry privado ou
escopo próprio, e o mecanismo (`npmPartes`) não muda: só a lista de pacotes.

Essa é uma decisão do dono da conta npm, não do código.
