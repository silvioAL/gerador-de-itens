# SPEC-36 — Regras por componente (design; sem implementação decidida)

## 1. Origem

§166: ao remover o seletor "Tecnologia" da aba de Regras, o usuário nomeou o
desalinhamento — *"nós temos padrão por componente"*. A tela hoje TRADUZ
("Mobile — vale para: App Android, App iOS"), mas o eixo de organização
continua sendo a tech. Esta SPEC registra o desenho para alinhar de vez o
eixo ao vocabulário do produto, e para a decisão não ser tomada por impressão.

## 2. Medições (como a ponte item→regra funciona hoje)

1. O item derivado herda `techs` e `contextos` do TIPO do componente
   (`nodeTypes[].techs/contextos`, config do diagrama).
2. `gerarRefinamento` seleciona regras por `contextoBate`: regra sem contexto
   vale para toda a tech; com contexto, casa por PREFIXO
   ("Backend-mensagens" pega "Backend-mensagens rabbitmq" e "… kafka").
3. Portanto o modelo já tem TRÊS granularidades: tech (grossa), contexto
   (média, por prefixo), contexto exato (fina). O que falta não é poder de
   expressão — é a UI e a criação falarem por componente.
4. Uma regra de "Backend" vale hoje para ~14 tipos de componente de uma vez.
   Qualquer desenho "por componente puro" precisa responder onde essa regra
   mora sem ser copiada 14 vezes.

## 3. Duas opções

### Opção A — projeção por componente (recomendada)

O arquivo `regras.json` continua `porTech` (nenhuma migração; motor intacto).
Muda a criação e a leitura na tela:

- **Criar**: "adicionar regra para [Fila Rabbit ▾]" — o select é de
  COMPONENTES; o tipo escolhido deriva tech + contexto automaticamente
  (Fila Rabbit → `Backend` + `Backend-mensagens rabbitmq`). Quem quer a regra
  mais larga sobe o escopo num segundo select já preenchido ("vale para: só
  Fila Rabbit / toda mensageria / todo Backend") — que é exatamente escolher
  entre contexto exato, prefixo e tech, com nomes legíveis.
- **Ler**: além dos grupos por tech de hoje, cada regra mostra os componentes
  que alcança (a tela já sabe: `componentesPorTech` + match de contexto).

Custo: UI apenas. Risco: baixo. O vocabulário fica 100% componente sem tocar
no formato que RBAC (`secoesDeRegrasAlteradas`), diagnóstico e motor leem.

### Opção B — migração para `porComponente` com herança

`regras.json` passa a `porComponente[tipoNo]` + um nível `comum` (ou grupos),
motor novo de seleção, migração de documento, RBAC por seção recalculado,
diagnóstico refeito. Ganho sobre a Opção A: nenhum — as três granularidades
já existem; a migração só muda ONDE a mesma informação mora. Custo: alto e
espalhado (motor, servidor, RBAC, migração de dados de quem já tem regras).

## 4. Recomendação

Opção A. A frustração medida (§166) era de VOCABULÁRIO e de operação de
seletor — ambas resolvidas na projeção. A Opção B fica registrada como o
caminho caso um dia exista uma necessidade que a projeção não cubra (ex.:
regra específica de UM componente sem contexto próprio na config) — e nesse
dia o primeiro passo é criar o contexto que falta, não migrar o arquivo.

## 4.1 Implementada (§179)

A Opção A entrou: formulário "adicionar regra para [componente ▾]" com
escopo legível e prévia de alcance (`regraPorComponente.ts`), documento
`porTech` intacto. De quebra, o E2E do §5 desenterrou e consertou um defeito
real: a revisão lia o `regras.json` estático do bundle enquanto a aba
gravava no documento do banco — a regra criada pela UI nunca chegava na
ficha. `carregarConfig` agora lê o documento editável (estático de fallback).

## 5. Feito quando (se a Opção A for aprovada)

Criar uma regra escolhendo "Fila Rabbit" grava com o contexto certo sem o
usuário digitar tech nenhuma; o escopo ("só este componente / grupo / todo
Backend") aparece com nomes de componente; E2E prova a gravação e o item
derivado de uma Fila Rabbit recebendo a regra; prova de mordida no mapeamento
componente→contexto.
