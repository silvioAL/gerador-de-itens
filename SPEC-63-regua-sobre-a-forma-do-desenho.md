# SPEC-63 — A régua sobre a FORMA do desenho

> **Origem:** o passo **#2** da ordem que o usuário declarou na
> [SPEC-56 §0.4](SPEC-56-avaliacao-simarch.md) — *"padrão como regra
> verificável sobre topologia e valor"* — e o único dos quatro primeiros ainda
> aberto. Os passos #1 (requisito/rastreabilidade), #3 (ADR) e #4 (percurso)
> foram construídos pela SPEC-57; o #5 (número com unidade) pela `Checagem` com
> `valorDe`/`multiplicadoPor` (§241).

---

## 1. A assimetria

A mesa hoje sabe cobrar duas coisas, e não sabe cobrar a terceira:

| Escopo | Tipo | Pergunta que responde |
|---|---|---|
| `porTech[tech].checklistTecnico[].checagem` | `Checagem` | *este COMPONENTE declara o que o padrão exige?* |
| `percursos[].checagem` | `ChecagemDePercurso` | *este CAMINHO soma dentro do que o padrão permite?* |
| — | — | *este DESENHO tem a forma que o padrão exige?* |

O que falta não é um campo a mais nem um caminho a mais: é a classe de defeito
que não mora em elemento nenhum **nem em caminho nenhum** — mora na *ausência*
ou na *presença* de uma ligação.

- **Fila sem consumidor.** Cada nó está completo, cada campo preenchido, e a
  mensagem não chega a lugar nenhum.
- **Aresta direta do app para o banco.** Nenhum campo está errado; o que está
  errado é existir a seta.
- **Recurso de terceiro sem alternativa.** O caminho existe e é o único.

O `detectarConflitos()` que já temos (`dependency/dependencias.ts`) olha o
**grafo de atividades derivadas** — `ALVO_INEXISTENTE`,
`INDEPENDENT_COM_DEPENDENCIA`, `ENABLER_E_DEPENDENT`. Nenhuma linha dele olha o
desenho. Medido na SPEC-56 §10, e continua verdade.

### A régua

> **A regra de topologia responde à MESMA pergunta das outras duas — "este
> desenho contraria o padrão do time?" — e nunca a "este grafo é válido?".**

É a linha que impede isto de virar um linter de grafo genérico. Não vamos
cobrar ciclo, nó órfão ou componente desconectado por serem "feios": cobra-se o
que o time declarou como padrão, com o porquê junto, como já se faz nos outros
dois escopos.

## 2. Por que agora, e por que é barato

A própria SPEC-56 §10 disse que P8 era **consequência, não fundação**: *"as
regras mais valiosas precisam de P1 (é sobre caminho) e de P2 (é sobre número).
Com as duas, P8 é config"*.

As duas estão de pé. O que sobra é aditivo em cima de mecanismo pronto: o
documento de regras já é banco e já tem tela, a violação já tem três superfícies
(placar, avisos da derivação, documento) e o ciclo de ajuste já sabe propor,
prever e aplicar mudança de regra.

## 3. O tipo de regra

Terceiro escopo em `RegrasConfig`, **ao lado** de `porTech` e `percursos` — não
dentro deles:

```ts
export interface RegrasConfig {
  tipos: string[];
  tamanhos: string[];
  porTech: Record<string, RegrasPorTech>;
  percursos?: RequisitoDePercurso[];
  /** SPEC-63 — as réguas que valem sobre a FORMA. */
  topologia?: RequisitoDeTopologia[];
}
```

Fora de `porTech` pela mesma razão que o percurso ficou fora (§ do
`RequisitoDePercurso`): **uma regra de forma atravessa techs por definição** —
"fila sem consumidor" é sobre o tipo `queue` e sobre quem consome, que quase
nunca é da mesma tech. Enfiá-la em `porTech` obrigaria a escolher uma
arbitrariamente.

```ts
export interface RequisitoDeTopologia {
  /**
   * Chave ESTÁVEL, e é o que separa esta regra do seu próprio texto.
   * `texto` é editável; a exceção aceita (§6) aponta para o `id`, e renomear a
   * regra não pode desligar as exceções que alguém registrou com motivo.
   * Mesma disciplina de `Atividade.chave` × `rotulo`.
   */
  id: string;
  texto: string;
  /** §242 — por que este padrão existe. É o que transforma cobrança em ensino. */
  porque?: string;
  checagem: ChecagemDeTopologia;
}

export type ChecagemDeTopologia =
  /** "Todo nó do tipo X precisa de uma conexão {entrando|saindo}, [do tipo A],
   *  [ligada a um nó do tipo Y]." */
  | {
      tipo: "exige-conexao";
      tipoNo: string;
      direcao: "entra" | "sai";
      tipoAresta?: string;
      tipoNoOposto?: string;
    }
  /** "Nenhuma conexão [do tipo A] pode ligar um nó do tipo X a um do tipo Y." */
  | {
      tipo: "proibe-conexao";
      deTipoNo: string;
      paraTipoNo: string;
      tipoAresta?: string;
    };
```

### 3.1 Dois operadores, e por que não três

A tentação é um terceiro, `exige-intermediario` (*"toda escrita no banco passa
por um serviço"*). Ele **não entra**, porque já é expressável: é
`proibe-conexao` da origem direto para o destino. O caminho desejado não precisa
ser afirmado — precisa ser o único que sobra.

Os dois operadores cobrem os três casos canônicos da SPEC-56 §10:

| Caso | Como se escreve |
|---|---|
| fila sem consumidor | `exige-conexao` em `queue`, direção `sai` |
| app falando direto com o banco | `proibe-conexao` de `app` para `database` |
| toda escrita passa por serviço | o mesmo `proibe-conexao` acima |

O que **fica de fora e é dito aqui** para não parecer omissão: *"recurso de
terceiro sem alternativa"* precisa contar caminhos distintos até um nó, e isso é
régua de percurso com agregação nova — não é forma, é contagem sobre caminho.
Fica anotado para a SPEC que evoluir `ChecagemDePercurso`.

### 3.2 Falhar alto

`validateRegras` reprova a subida quando:

- dois requisitos de topologia têm o mesmo `id`;
- `tipoNo`/`tipoNoOposto`/`deTipoNo`/`paraTipoNo` não existem em
  `diagrama.json`;
- `tipoAresta` não existe em `edgeTypes`.

É o mesmo tratamento que `when.field` inexistente já recebe. Regra que aponta
para um tipo que não existe não é regra frouxa: é regra que nunca dispara, e
descobrir isso por silêncio é o pior jeito.

## 4. O que a avaliação devolve

Função pura em `packages/engine/src/conformidade/topologia.ts`, ao lado da
conformidade de valor:

```ts
export function avaliarTopologia(
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig,
  excecoes: ExcecaoDePadrao[] = []
): ViolacaoDeTopologia[];

export interface ViolacaoDeTopologia {
  regraId: string;
  texto: string;
  porque?: string;
  /** Onde a violação MORA. `exige-conexao` acusa o NÓ que ficou sem a ligação;
   *  `proibe-conexao` acusa a ARESTA que não devia existir. Um dos dois, nunca
   *  os dois: é o que permite ao painel do elemento mostrar o que é dele. */
  noId?: string;
  arestaId?: string;
  /** Rótulo do elemento — o id sozinho não diz nada a quem lê. */
  rotulo: string;
  esperado: string;
  atual: string;
  excecao?: ExcecaoDePadrao;
}
```

O par `esperado`/`atual` existe para a mensagem ser a mesma família das outras
duas: *"esperado: uma conexão `consome` saindo — está: nenhuma"*.

### 4.1 Nó `existente` também é cobrado

Um nó `status: existente` (a fila que já roda em produção) **entra na medição
como qualquer outro**, e isto é decisão, não descuido.

O argumento contrário é real: *"o consumidor existe, só não foi desenhado"*. Mas
é exatamente aí que a régua da casa manda: **o desenho é a verdade que a mesa
mede**, e um desenho que omite o consumidor está incompleto — desenho incompleto
é o que esta ferramenta existe para revelar, não para tolerar. Quem tem o caso
legítimo tem a válvula do §6, que deixa o motivo escrito em vez de deixar o
vermelho apagado por regra.

## 5. Onde a violação aparece

Nenhuma superfície nova. As quatro que já existem, e o que cada uma ganha:

| Superfície | O que muda |
|---|---|
| **Placar da mesa** (`ReadinessSummary`) | o chip `⚖` passa a somar as violações de forma junto com as de valor — é a mesma pergunta ("fora do padrão"), e dois chips separados dividiriam a atenção sem dividir o assunto |
| **Reconhecimento antes de derivar** (`AvisosDaDerivacao`, §261) | violação de forma entra na lista do que a derivação não resolve — é o momento em que ela mais importa, porque derivar sobre um desenho torto produz item torto |
| **Documento** (`conferencias`) | seção "O que foi conferido" ganha as violações de forma, e a faixa de saúde as conta no lado que **pede atenção** (SPEC-61 §4) |
| **Painel do elemento** | o nó (ou a aresta) selecionado mostra a regra que ele contraria, com o `porque` — é onde se resolve |

## 6. A válvula: exceção com motivo

`ExcecaoDePadrao` ganha um campo, e não uma coleção nova:

```ts
export interface ExcecaoDePadrao {
  /** Elemento onde a violação foi aceita — nó, ou ARESTA (SPEC-63). */
  noId: string;
  /** Campo conferido — junto com `noId`, identifica a violação de VALOR.
   *  Vazio quando a exceção é de topologia: ali quem identifica é `regraId`. */
  campo: string;
  /** SPEC-63 — id da regra de FORMA aceita. */
  regraId?: string;
  motivo: string;
  autor: string;
  em: string;
}
```

Mesma coleção (`quebra.excecoes`), sem migração, e o par que identifica fica
explícito: `(noId, campo)` para valor, `(noId|arestaId, regraId)` para forma.

**Por que a válvula entra JUNTO, e não numa fatia depois.** O §242 já decidiu
isto para as violações de valor: *"violar o padrão é permitido — e fica
registrado. Sem essa saída, a pessoa aprende a ignorar o vermelho, e a medição
inteira morre junto."* Para a forma o argumento é mais forte, não mais fraco: a
fila sem consumidor *hoje* porque o consumidor vem na próxima demanda é o caso
comum, não o exótico. Sem válvula, a primeira semana ensina o time a ignorar o
`⚖`.

E a exceção aceita continua sendo lida como **decisão** no documento
(`excecoesComoDecisoes`, §242) — de graça, porque o mecanismo já é esse.

> **Dívida reconhecida, e não corrigida aqui:** as violações de **percurso**
> continuam sem válvula. É uma assimetria que já existia; esta SPEC não a
> aumenta (topologia nasce com válvula) mas também não a fecha. Fica nomeada
> para quem for mexer em percurso.

## 7. Como a regra é criada

Aqui está a parte que decide se isto nasce inteiro ou pela metade.

**Precedente:** as réguas de percurso não têm editor — vivem no documento de
regras e só se editam por API. Isso é aceitável para nascer, e é ruim para
viver: capacidade que só se configura por JSON é capacidade que o time não usa.

Então:

- **fatias A–C entregam o mecanismo** lendo o documento como ele está;
- **a fatia D entrega a edição pela tela** (`RegrasTab` ganha a seção
  "Forma do desenho") **e a operação de ajuste do PDCA**
  (`adicionar-topologia` / `remover-topologia` em `OperacaoDeAjuste`), para que
  a regra de forma nasça do feedback como qualquer outra;
- a fatia D **não é opcional** — é o que separa "existe" de "é do time".

A prévia do estúdio (SPEC-45 / §4.5 do `CONTEXTO-E-ARQUITETURA`) precisa
responder a pergunta certa para esta regra: mostrar o efeito **num item de
exemplo** não serve, porque regra de forma não muda texto de item. A prévia
passa a ser **quantos elementos do desenho ATUAL a regra acusaria** — que é a
pergunta que quem propõe realmente tem.

## 8. Ordem de implementação

1. **Fatia A — o motor.** Tipo, `avaliarTopologia`, validação. Função pura,
   testável sozinha, não muda tela nenhuma.
2. **Fatia B — as superfícies.** Placar, avisos da derivação, documento, painel
   do elemento.
3. **Fatia C — a válvula.** Aceitar com motivo, e a exceção lida como decisão.
4. **Fatia D — a edição.** Seção na `RegrasTab`, operação no PDCA, prévia que
   conta elementos acusados.

A → B → C → D, e a razão da ordem: A é a única que pode ser conferida sem
opinião; B é o que a torna visível; C é o que a torna sustentável; D é o que a
torna do time. Parar em qualquer ponto antes de D deixa uma capacidade que
existe e ninguém configura — e este produto já teve essa lição (§194: o feedback
que o agente coletava e ninguém via).

## 9. O que esta SPEC não faz

- **Não cobra o grafo por estética.** Ciclo, nó solto e componente desconectado
  continuam fora: quem os cobra é `detectarConflitos` (sobre atividades) e o
  reconhecimento da derivação. Regra de forma só existe se o time a declarou.
- **Não conta caminhos** (o "sem alternativa" do §3.1) — é evolução de percurso.
- **Não infere regra a partir do desenho.** Um agente propondo "vocês sempre põem
  um serviço entre app e banco, quer virar regra?" é tentador e é outra SPEC:
  aqui a regra nasce de gente, como as outras duas.
