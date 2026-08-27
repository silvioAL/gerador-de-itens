# SPEC-69 — O débito consciente

> **Origem:** o usuário perguntando *"o que acontece quando se clica em aceitar?
> qual é o valor do próximo passo?"* — e, ao ver que não havia nenhum,
> declarando o propósito que faltava:
>
> > *"eventualmente o negócio pode decidir que vai aceitar isso ou não, mas ele
> > também exige um tempo. **O valor está em tornar visível e assim antecipar
> > decisões e débitos técnicos inconscientes.**"*

---

## 1. O botão que não levava a lugar nenhum

Medido: `aceitar` num ensaio troca um campo `aceito` de `false` para `true`. O
efeito é a linha sair da opacidade reduzida e o botão sumir. **Ninguém mais lê
esse campo** — a única outra leitura de `cenariosDeLentidao` é dizer à IA quais
nomes não repetir.

O cenário aceito não vira item, não vira régua, não entra no documento, não é
citado. "Aceitar" significa hoje *"eu li isto e não é lixo"*.

Isso destoa de todo o resto do produto, onde aceitar tem consequência: decisão
aceita vai ao documento e é citada pelos itens; régua publicada cobra no placar;
caminho confirmado liga as réguas e põe item no backlog.

> A SPEC-66 §7 recusou "vira item de backlog", com razão — o produto não decide
> arquitetura pelo time. **Mas recusar uma saída não é o mesmo que não precisar
> de nenhuma**, e foi isso que eu deixei acontecer.

## 2. O propósito, na formulação do usuário

> **O ensaio não existe para consertar nada. Existe para que ninguém descubra em
> produção algo que dava para saber na mesa.**

"Débito técnico inconsciente" é a expressão exata, e ela reordena o desenho:

- o destino do ensaio aceito **não é uma correção** — é um **registro
  consciente**;
- quem decide aceitar pode ser o **negócio**, não só a técnica;
- e o valor é a **antecipação**: o número existe antes de a decisão ser tomada,
  e não como autópsia.

É o §242 ("aceitar de propósito, com motivo") aplicado a um número que ninguém
tinha.

## 3. O que falta para o número decidir alguma coisa

> **"24 s" sozinho não decide nada. "24 s contra os 5 s que o negócio pede"
> decide.**

Hoje não existe onde declarar o que o negócio exige. A `Necessidade` (SPEC-57
fatia A) é o propósito do negócio na mesa — *"aprovar crédito na hora"* — e ela
não tem número.

```ts
export interface Necessidade {
  id: string;
  texto: string;
  prioridade?: "alta" | "media" | "baixa";
  // …
  /**
   * SPEC-69 — o tempo que o NEGÓCIO exige desta necessidade, em ms.
   *
   * É o que transforma a leitura em decisão: sem ele, "a resposta soma 3 s" é
   * um fato sem consequência; com ele, é "3 s contra os 2 s que prometemos".
   *
   * Ausente = o negócio não declarou prazo, e nada se afirma. Inventar um
   * limite padrão seria o produto decidindo o SLA do time.
   */
  limiteMs?: number;
}
```

**Por que na necessidade e não no percurso.** O percurso já sabe cobrar tempo
(`ChecagemDePercurso`, SPEC-57/64) — mas aquilo é a régua **do time**, e esta é
a exigência **do negócio** para *esta demanda*. São duas perguntas: "isto segue o
padrão da casa?" e "isto entrega o que prometemos ao cliente?". Um desenho pode
passar na primeira e falhar na segunda.

## 4. Todo ensaio cobra, e `aceitar` é a válvula

Esta é a correção que reorganizou a SPEC inteira, e ela veio do usuário:
**"na realidade todo ensaio cobra."**

Eu tinha desenhado o contrário — só o aceito cobraria —, e estava errado pelo
próprio propósito declarado: **se só o que alguém aceitou cobra, o débito que
ninguém olhou continua invisível.** E débito que ninguém olhou é exatamente o
inconsciente que esta SPEC existe para acabar.

Com a inversão, os três verbos ganham sentido de uma vez:

| verbo | o que significa | o que acontece |
|---|---|---|
| *(existir)* | "este cenário é plausível" | **cobra** no placar, marcado com o nome do ensaio |
| **aceitar** | "sabemos e assumimos" | **sai do placar**, vira registro com autor e data |
| **apagar** | "este cenário não nos interessa" | some |

### 4.0 O fluxo, mapeado

> *"o fluxo é avaliar, revisar, e aceitar ou modificar (com apoio da IA) — mas
> precisa ser um processo muito bem mapeado."*

Três botões soltos numa linha não são um processo. O ensaio passa a ter
**estado**, e cada estado diz o que se espera de quem está olhando:

```
       (a IA propõe · ou alguém cria)
                    │
                    ▼
            ┌───────────────┐   modificar       ┌──────────────┐
            │  POR AVALIAR  │◀─────────────────▶│  EM REVISÃO  │
            │  cobra ⚖      │                   │  cobra ⚖     │
            └───────┬───────┘                   └──────┬───────┘
                    │  avaliei, faz sentido            │
                    └──────────────┬───────────────────┘
                                   ▼
                          ┌─────────────────┐
                          │     ACEITO      │  ← débito consciente
                          │  não cobra mais │     (quem, quando, por quê)
                          └─────────────────┘
                                   │ reabrir (§283)
                                   └──────────▶ volta a cobrar
```

| estado | quem age | o que a tela pede |
|---|---|---|
| **por avaliar** | qualquer um | *leia o que este cenário revela* |
| **em revisão** | quem está mexendo | *os ajustes fazem sentido? a IA pode refinar* |
| **aceito** | quem assume | *diga por quê — é o que separa débito consciente de anônimo* |

Duas regras que o desenho impõe:

- **"por avaliar" e "em revisão" cobram igual.** O que tira do placar é
  **aceitar**, não olhar. Sair da cobrança por ter aberto a linha seria a
  fórmula de fazer as pessoas abrirem tudo sem ler;
- **aceitar exige motivo**, como a exceção do §242. Sem motivo, isto vira um
  botão de silenciar — e a próxima pessoa a abrir o documento não saberá se
  aquilo foi decisão ou cansaço.

### 4.0.1 Reduzir o esforço cognitivo de avaliar

> *"podemos melhorar nesse sentido, de expor um porquê mais descritivo que
> reduza o esforço cognitivo."*

Hoje a linha entrega números crus — `≥ 24 s`, `+21 s`, `bureau (24 s)` — e
**pede que a pessoa monte a frase na cabeça**. Quem avalia precisa cruzar quatro
colunas para chegar à conclusão que o motor já tem.

A linha passa a trazer a conclusão escrita, e os números viram a evidência dela:

> **Sob pico, a resposta vai de 3 s para 24 s — 5× o prazo de 5 s que o negócio
> pede.** O bureau responde por 24 dos 24 s; nada mais no caminho pesa.

Três regras para essa frase:

1. **compara com o que o negócio pediu** quando há `limiteMs`; sem ele, compara
   com hoje e não inventa julgamento;
2. **nomeia o dominante** — é o que transforma "está ruim" em "está ruim por
   causa disto";
3. **é derivada, nunca escrita pela IA.** O texto do modelo é o *porquê do
   cenário* ("fins de semana concentram 40% das solicitações"), que é
   conhecimento de mundo. A conclusão sobre o número é aritmética, e mistura dos
   dois seria a IA opinando sobre a conta.

> **É o §242 outra vez, e não por acaso.** A válvula da exceção com motivo — *"violar
> o padrão é permitido, e fica registrado; sem essa saída a pessoa aprende a
> ignorar o vermelho"* — é o mesmo mecanismo, aplicado a um número que ninguém
> tinha. Aceitar não silencia: **converte** débito inconsciente em decisão
> registrada, e é essa conversão que dá nome à SPEC.

### 4.1 Como a cobrança aparece

As contradições que o ensaio revela (saturação, insistência maior que a
paciência de quem chama) e o estouro do prazo do negócio entram no placar ⚖
**marcados com o nome do ensaio**:

> *"Sob **Bureau degradado em horário de pico**: `srv-credito-api` precisa de 100
> chamadas simultâneas e declara 10."*

A marcação não é enfeite: ela diz na própria frase que aquilo é **condicional**,
e é o que impede o placar de confundir *o que é* com *o que seria* — a régua que
a SPEC-65 traçou entre leitura e cobrança.

### 4.2 Ele confronta o prazo do negócio

Com `limiteMs` declarado, o ensaio aceito responde a pergunta que interessa:

| | resposta | limite do negócio | |
|---|---|---|---|
| hoje | ≥ 3,0 s | 5 s | cabe |
| Bureau em pico *(aceito)* | ≥ 24 s | 5 s | **não cabe** |

Sem `limiteMs`, a coluna não aparece — e a ausência é honesta: ninguém prometeu
nada, então não há o que confrontar.

### 4.3 Ele vira evidência de uma decisão

O ensaio aceito pode ser **anexado a uma decisão** (`Decisao.ensaioIds`). E aí
ele viaja pelos caminhos que já existem, sem superfície nova:

```
ensaio aceito ──anexado a──▶ decisão ──┬──▶ documento (a seção de riscos)
                                       └──▶ item (o "porquê" que ele já cita)
```

**Uma origem, dois leitores.** Quem aprova o desenho lê o risco medido no
documento; quem implementa lê o número no item, ao lado do critério de aceite —
e para essa pessoa "sob pico esta chamada leva 24 s" muda como ela escreve o
código.

### 4.4 O texto humano não é sobrescrito

A seção de riscos do documento é `documentoEscrito.riscos`: **escrita por
gente**, e a SPEC-58 regra 3 garante que sobrevive à regeneração.

O ensaio entra como **bloco derivado ao lado**, nunca dentro. Dois blocos, uma
seção, nenhum sobrescreve o outro — a mesma disciplina que separa o que o motor
calcula do que a pessoa escreve, em todo o resto do produto.

## 5. O que NÃO entra, e por quê

**Propor melhorias no desenho.** O usuário levantou e já pôs o cuidado
("pode não ser viável"); eu vou além: **não fazer**. Uma proposta de arquitetura
gerada por modelo é o tipo de coisa plausível-mas-errada que corrói a confiança
em tudo o mais na tela — e um *"adicione um cache aqui"* que o time não pode
executar (contrato, custo, time dono) transforma a ferramenta em alguém que não
entende o problema.

O que já temos e é honesto é a coluna **"quem domina"**: *"o bureau responde por
24 dos 24 s"* é fato, e a conclusão é de quem lê. Ajudar a decidir sem decidir.

**Ensaio virando item de backlog.** Segue recusado (SPEC-66 §7). O que vira item
é a **decisão**, quando houver — e por isso ela é o elo.

## 6. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | `Necessidade.limiteMs` e o confronto com a resposta medida | unitário: 24 s contra 5 s acusa; sem limite, silêncio |
| **B** | O ensaio cobra, e **aceitar** é a válvula: estado, motivo, autor e data | unitário: por avaliar cobra; aceito não; reabrir volta a cobrar |
| **C** | A frase derivada que reduz o esforço de avaliar | unitário: cita o limite do negócio quando há, e o dominante sempre |
| **D** | `Decisao.ensaioIds` — a evidência viajando ao documento e ao item | unitário no `gerarEspecificacaoEntrega` |
| **E** | As superfícies e o E2E | E2E: o ensaio cobra → aceitar com motivo tira do placar → reabrir devolve |

**A ordem tem uma dependência dura:** B antes de E, porque a máquina de estados
decide o que a tela mostra. E A antes de C, porque a frase da §4.0.1 cita o
prazo do negócio — escrevê-la antes seria escrever metade dela duas vezes.

## 7. Perguntas em aberto

1. **Quem "aceita" pelo negócio?** O `aceito` hoje é booleano. Registrar autor e
   data (como a exceção do §242 faz) é barato e transforma "alguém aceitou" em
   "fulano aceitou em tal dia" — recomendação: **sim**, e é o que separa débito
   consciente de débito anônimo.
2. **`limiteMs` na necessidade cobre o caso de duas necessidades com prazos
   diferentes sobre o mesmo caminho?** Não, e nesse caso vale a mais apertada —
   como o `avaliarResiliencia` já faz com a paciência de quem chama.
3. **O ensaio aceito deveria aparecer na faixa de saúde da mesa?** Recomendação:
   **não**. A faixa é sobre o desenho de agora; misturar hipótese ali é
   exatamente o que o §4.1 evita ao marcar cada violação com o nome do ensaio.
