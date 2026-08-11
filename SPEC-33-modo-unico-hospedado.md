# SPEC-33 — Modo único: só o hospedado

## 1. Objetivo

Deixar de manter dois modos de execução. O produto passa a ser **um servidor
Fastify + Postgres + navegador**, e o modo local (`gerador open`, roteador
`node:http`, persistência em arquivo, pacote npm) sai do repositório.

## 2. A decisão, e de onde ela veio

Do usuário, textualmente: *"vamos rodar apenas o modo hospedado, vou baixar na
outra máquina, e excluir o outro modo"* — e, sobre o pacote publicado,
*"pode remover o pacote do npm"*.

Não é uma limpeza oportunista: é a resposta ao problema que a SPEC-31 tentou
resolver por outro caminho. Aquela SPEC nasceu porque o domínio estava
implementado duas vezes e as duas cópias divergiam sozinhas. As portas mataram
a divergência na persistência; **o modo único mata a causa.**

## 3. O que foi medido antes de escrever isto

```
openApiLocal.ts                      1.118 linhas
packages/cli/src/adaptadores/*.ts      523 linhas  (só openApiLocal importa)
paridade.sanity.test.ts                122 linhas
comandos do CLI:
  open.ts            108   <- modo local
  ia.ts              355   <- instala/checa modelo GGUF na máquina
  derive.ts           72   <- headless, não depende do modo local
  implementar.ts      84   <- headless
  importGraphify.ts   57   <- headless
  init.ts             49   <- headless
```

E duas medições que mudaram decisões:

- **`gerador-de-itens` teve 8.576 downloads na última semana.** Isso impede o
  `npm unpublish` (política de 300/semana) e tornaria a remoção uma quebra para
  quem já instalou. Decisão: **`npm deprecate`**, não unpublish.
- **Nem `packages/web` nem `packages/server` dependem de `packages/cli`.** A
  remoção não tem efeito de cascata sobre o produto hospedado.

## 4. Consequências sobre a dívida hexagonal (revisão do #295)

A SPEC-31 §11 deixou três achados. O modo único reescreve dois:

| Achado | O que acontece |
| --- | --- |
| #303 `RepositorioDeCamposAresta` | Deixa de ser sobre **duplicação** (some um dos dois adaptadores) e vira sobre **tirar SQL de dentro da rota**. Continua valendo, com prioridade menor. |
| #304 paridade por forma | **Perde o objeto.** Não há duas bordas para comparar. `paridade.sanity.test.ts` sai junto com o modo local. |
| #305 cobertura do lado condutor | **Sobrevive inteiro.** |
| #308 contrato do `client.ts` | **Sobrevive inteiro** — já entregue (`contratoDoClienteWeb.test.ts`). |

Registrar isto aqui é o ponto: sem esta seção, alguém retomaria o #304 daqui a
um mês construindo um teste para uma fronteira que não existe mais.

## 5. O que sai

1. `packages/cli/src/commands/openApiLocal.ts` e seu teste.
2. `packages/cli/src/adaptadores/*` — nada mais os importa.
3. `packages/cli/src/commands/open.ts`.
4. `packages/aplicacao/src/paridade.sanity.test.ts`.
5. `.github/workflows/publish.yml` — **já removido** (PR #109).
6. `packages/cli/web-dist` e o passo do build que copia o `dist` do web para
   dentro do pacote.
7. As seções de instalação via npm no `README.md`.
8. `SPEC-17-cli-local-first.md` ganha um aviso de superada por esta.

## 6. O que fica, e por quê

- **Os comandos headless** (`derive`, `implementar`, `import-graphify`,
  `init`) não dependem do modo local: leem arquivo, chamam o engine, escrevem
  arquivo. São 262 linhas que servem a automação/CI de quem usa o produto.
  **Decisão pendente do usuário:** manter como pacote (com outro nome e outro
  propósito) ou remover junto. Enquanto não decidir, ficam.
- **`gerador ia instalar`** (355 linhas) instala o GGUF na máquina. Só faz
  sentido com provedor local; no hospedado o gateway é o caminho. Sai **se** a
  decisão acima for remover o pacote inteiro.
- **`publicar-modelo.yml`** e os pacotes-parte do GGUF seguem a mesma sorte do
  item anterior.

## 7. Roteiro

Cada fase é um PR, e nenhuma remove nada antes de a suíte provar que ninguém
dependia daquilo.

- **Fase 0 — parar de publicar.** ✅ feito (PR #109). `git tag` deixa de
  publicar no npm; o release passa a ser imagem Docker.
- **Fase 1 — `npm deprecate`.** Depende de sessão interativa do npm, do
  usuário. Mensagem já redigida.
- **Fase 2 — cobrir o que vai ficar sem rede.** As 4 abas de Configurações sem
  nenhum E2E (#306): Regras de refinamento, Acessos, Pipeline de IA, Campos por
  tipo de conexão. **Antes** de remover, não depois: é a única forma de a
  remoção não ser um salto no escuro.
- **Fase 3 — remover o modo local** (§5, itens 1 a 4 e 6 a 8).
- **Fase 4 — decidir o destino dos comandos headless** (§6). Sem decisão, não
  se toca neles.

## 8. Riscos, ditos por nome

- **A Fase 2 antes da 3 não é zelo, é a lição de hoje.** A aba "Regras de
  refinamento" abriu em branco em produção porque nada a clicava num navegador
  (JOURNEY §153). Remover um modo inteiro com quatro abas descobertas repetiria
  isso em escala.
- **`mostrarCamposAresta` e `modo === "local"` estão espalhados pela UI.**
  Remover o modo significa apagar ramos de código, e cada `if` de modo é um
  lugar onde a metade errada pode sobrar — que é exatamente o defeito de hoje.
  O teste genérico "nenhuma aba visível abre em branco" (`ConfigScreen.test.tsx`)
  fica como rede.
- **Deprecar não é remover.** Quem já instalou continua funcionando com uma CLI
  que fala com um `openApiLocal` que não existe mais no repositório. É
  aceitável — a versão publicada é imutável e continua íntegra —, mas ninguém
  deve prometer suporte a ela.

## 9. Verificação

Por fase: suíte completa verde nos cinco workspaces, `npm run build
--workspaces --if-present` exit 0, E2E verde, e — na Fase 3 — a stack
rebuildada e conferida no navegador, porque remoção de ramo de código não
aparece em teste unitário quando o ramo removido era o que a tela usava.
