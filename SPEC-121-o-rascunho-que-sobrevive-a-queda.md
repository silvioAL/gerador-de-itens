# SPEC-121 — O rascunho que sobrevive à queda

> **Origem:** o usuário, depois de carregar um cenário pronto, clicar em
> "Derivar Quebra" e chegar à seção dos itens com a tela dizendo *"Salve a
> demanda antes de exportar — sem id da quebra não há o que mandar"*:
>
> > *"na realidade ao clicar em derivar quebra ele já deveria ter salvo"*
>
> E, na sequência, o pedido que generaliza o relato:
>
> > *"escreva uma spec de autosave de rascunho, pois o usuário pode estar
> > desenhando do zero ou a partir de um cenário pronto e ficar sem energia ou
> > algo assim"*
>
> Esta SPEC **não implementa nada** — mede o que existe, nomeia a janela que
> não está coberta e faz as perguntas cuja resposta muda o desenho.

---

## 0. A medição, antes de propor

O produto **já tem autosave**, e ele é bom. A SPEC-72 fatia B construiu o que
falta em muita ferramenta: debounce de 2 s, e um *flush* do que estiver pendente
quando a aba some.

```ts
// usePersistencia.ts
relogioDoAutosaveRef.current = setTimeout(() => void salvar(quebra), 2000);
// e, registrados uma vez:
window.addEventListener("beforeunload", gravarPendente);
document.addEventListener("visibilitychange", aoEsconder);
```

O `visibilitychange` está lá pelo motivo certo, e está escrito: *"`beforeunload`
é menos confiável em móvel, onde a aba costuma ser descartada sem ele"*.

**Nada disso protege o caso que o usuário descreveu.** Duas linhas explicam por
quê.

### 0.1 A porta, e o motivo dela é legítimo

```ts
// Autosave só depois da quebra já ter sido salva ao menos uma vez (tem id do
// servidor) — sem isso, cada tecla criaria uma quebra nova em duplicata.
if (!quebraId) return;
```

A razão está certa e continua valendo: com `POST /quebras` a cada tecla, dois
segundos de digitação viram uma lista de demandas entulhada de fantasmas. O
comentário não é desculpa — é uma decisão consciente que nunca foi revisitada.

### 0.2 A segunda porta

```ts
if (!q.titulo?.trim()) {
  setStatus("sem-titulo");
  return;
}
```

Sem título, `salvar` **não chama a API**. Também legítimo: *"sem título, a
quebra fica impossível de reconhecer depois numa lista"*.

### 0.3 O que as duas portas somadas deixam de fora

| Momento | Protegido? |
|---|---|
| Abrir uma demanda salva e editar | ✅ autosave de 2 s + flush ao sair |
| Começar do zero, desenhar, **ainda sem salvar** | ❌ **nada** |
| Carregar cenário pronto, mexer, **ainda sem salvar** | ❌ **nada** |
| Nomear a demanda e salvar pela primeira vez | ✅ a partir daqui |

**A janela desprotegida é exatamente a do desenho.** É onde a pessoa passa mais
tempo, é onde ela toma as decisões que mais custam a refazer — e é a única parte
do fluxo em que o produto guarda tudo na memória do navegador.

> O pedido do usuário nomeia o gatilho de forma bem literal: *"ficar sem energia
> ou algo assim"*. Não é o caso raro. É a queda de luz, o navegador que mata a
> aba por memória, o `Ctrl+W` errado, o notebook que hiberna e volta com a
> sessão morta.

### 0.4 O `localStorage` está fora, e isso foi decidido

```ts
// `localStorage` continua fora disso, mesmo motivo de sempre:
// rascunho de recuperação, nunca fonte da verdade.
```

A frase é de quem já pensou nisto e escolheu não fazer. **Ela também descreve
exatamente o que esta SPEC propõe** — *rascunho de recuperação* — então o que
falta não é reverter a decisão: é notar que a segunda metade da frase autoriza a
primeira.

---

## 1. O relato do print, e o que ele NÃO prova ainda

O usuário derivou e chegou ao documento com 15 itens gerados e sem id de quebra.
Isso significa que o caminho de auto-save ao derivar não completou. Ele existe:

```ts
function executarDerivacao(salvarDepois: boolean) { … if (salvarDepois) setAutoSalvarPendente(true); }

useEffect(() => {
  if (autoSalvarPendente && resultado && (quebra.titulo ?? "").trim()) {
    setAutoSalvarPendente(false);
    void persistencia.salvar();
  }
}, [autoSalvarPendente, resultado, quebra.titulo]);
```

**Há quatro caminhos medidos por onde derivar não salva, e três são de
propósito.** Qual deles o print pegou é a pergunta 1 da §6 — e ela se fecha
reproduzindo, não deduzindo:

| Caminho | Salva? | É defeito? |
|---|---|---|
| `derivarQuebra()` com título | ✅ | — |
| `derivarQuebra()` com `somenteLeitura` | ❌ | não — *"salvar seria 403 no servidor"* |
| `opcoesTour.derivarQuebra` (tour/demo) | ❌ | não — *"é uma demonstração, não uma quebra de verdade"* |
| `salvar()` chamado e **falhou** (`status: "erro"`) | ❌ | **sim, se a tela não gritou** |

O quarto é o que merece atenção. `salvar` engole a exceção e vira
`setStatus("erro")`; se esse estado não for visível o bastante no momento em que
acontece, a pessoa segue trabalhando achando que está salva — que é pior que não
ter salvado.

> **O que isto diz sobre a SPEC:** mesmo que o print seja um dos três casos
> legítimos, a janela da §0.3 continua aberta. O relato é o sintoma; a falta de
> rascunho é a causa. Consertar só o sintoma deixaria "desenhei 40 minutos e
> caiu a luz" exatamente como está hoje.

---

## 2. A proposta: um rascunho local, que não é a verdade

```
o que existe hoje                    o que falta
─────────────────                    ───────────
servidor (Postgres)                  navegador (localStorage)
a fonte da verdade                   o rascunho de recuperação
salva com título, com id             salva sempre, desde a primeira aresta
autosave de 2 s + flush ao sair      o mesmo relógio, sem as duas portas
```

**As duas coisas não competem**, e é isso que torna a proposta barata: o
rascunho nunca é lido quando há demanda salva para abrir. Ele existe para
responder a uma pergunta só — *"o que eu estava desenhando quando isto morreu?"*.

### 2.1 A régua que organiza tudo: rascunho não é demanda

Um rascunho **não aparece na lista de demandas**, não tem id de servidor, não
conta em métrica nenhuma, não é exportável. Ele é um estado de recuperação do
navegador daquela pessoa.

É o que evita o problema que a porta da §0.1 existe para evitar — *a lista
entulhada de fantasmas* — sem precisar da porta: **o fantasma não chega ao
servidor.**

### 2.2 O que se recupera, e a régua de quem manda

Ao abrir o produto com um rascunho guardado, a pessoa é **perguntada**, não
restaurada em silêncio:

> *"Você estava desenhando isto aqui há 12 minutos, e não chegou a salvar.
> Continuar de onde parou, ou descartar?"*

Restaurar sozinho seria o desenho de ontem aparecendo por cima do que alguém
acabou de abrir hoje — e a régua desta casa para proposta que chega sem ser
pedida já está escrita em cinco lugares: **importar não é aceitar.**

### 2.3 Quando o rascunho morre

- a demanda foi salva no servidor → o rascunho daquela sessão sai de cena;
- a pessoa descartou → sai;
- ele envelheceu além de um teto (dias, não horas) → sai.

**O que NÃO o mata:** derivar, navegar entre telas, abrir configurações, o F5.

---

## 3. ⚠️ O que esta SPEC precisa decidir antes da primeira linha

### 3.1 O rascunho carrega dado de trabalho, e o navegador é um lugar novo

O `localStorage` é legível por qualquer script na mesma origem e sobrevive ao
logout. Um desenho de arquitetura não é um segredo como uma chave de API — mas
carrega nome de serviço interno, endpoint, às vezes volumetria de negócio.

Três regras que a implementação precisa seguir:

1. **Nada de credencial no rascunho.** A quebra não guarda chave hoje, e o
   rascunho não pode ser a porta por onde isso muda.
2. **O logout apaga.** Máquina compartilhada é o caso comum em muita empresa.
3. **Uma chave por pessoa**, como `timeLembrado.ts` já faz — não uma global que
   a próxima pessoa a entrar encontra.

### 3.2 O teto de tamanho, e ele não é teórico

`localStorage` costuma parar em ~5 MB por origem, e **estourar dá exceção
síncrona**. Um desenho grande com contexto colado e respostas da esteira chega
perto disso mais rápido do que parece.

`useTema.ts` já trata o caso (*"pode estourar em navegação privada ou com
cookies bloqueados"*), e é o molde. Estourar não pode derrubar a tela: o
rascunho falha, o trabalho continua.

**A decisão que sobra:** guardar a quebra inteira, ou só o que não se
recalcula? O diagrama é insubstituível; `resultado` e os itens derivados saem
dele de novo em milissegundos.

### 3.3 A porta da §0.1 continua existindo, ou o rascunho a substitui?

Duas saídas, e elas levam a produtos diferentes:

| | O que é | Custo |
|---|---|---|
| **Rascunho local só** | o servidor continua exigindo título e gesto | nenhuma mudança de backend; o rascunho é do navegador, e some se a pessoa trocar de máquina |
| **Rascunho no servidor** | a quebra nasce cedo, com um estado `rascunho` | atravessa máquinas, e traz de volta o fantasma na lista, que agora precisa de filtro, limpeza e migração |

**Recomendação: a primeira**, e o motivo é o alcance do problema que o usuário
descreveu. *"Ficar sem energia"* é a mesma máquina voltando — não é trocar de
computador. A segunda resolve um problema maior e cobra um preço que ninguém
pediu ainda.

### 3.4 E o que fazer com o gesto de derivar

Independente do rascunho, o relato da §1 aponta para uma pergunta de produto:
**derivar deveria salvar sempre?**

Derivar é o momento em que o desenho vira backlog — é o gesto mais parecido com
"terminei de desenhar" que existe no fluxo. Salvar ali é coerente, e o produto
já tenta. O que falta é a **falha do salvamento ser tão visível quanto o
resultado da derivação**: hoje ela vira um `status` no header, e o print mostra
alguém que passou por ela sem ver.

---

## 4. O que esta SPEC RECUSA

- **Rascunho como fonte da verdade.** A frase já está no código e continua
  valendo: *rascunho de recuperação, nunca fonte da verdade*. O que vale é o que
  está no servidor.
- **Restaurar em silêncio.** Ver §2.2 — desenho que aparece sozinho por cima do
  trabalho de alguém é pior que desenho perdido, porque ninguém sabe de onde ele
  veio.
- **Criar quebra no servidor a cada tecla.** É exatamente o que a porta da §0.1
  evita, e o motivo dela não expirou.
- **Guardar credencial, token ou chave no navegador.** Ver §3.1.
- **Derrubar a tela quando o `localStorage` estourar.** O rascunho é uma rede de
  proteção; uma rede que quebra a tela é pior que nenhuma (§3.2).
- **Mexer no autosave que já funciona.** A SPEC-72 fatia B está construída,
  testada e certa. O que falta é cobrir a janela ANTES dela — não reescrevê-la.
- **Rascunho por demanda salva.** Quem já tem id tem autosave de verdade; um
  rascunho paralelo criaria duas versões do mesmo trabalho divergindo.

---

## 5. Fatias

- **A — o rascunho existe e sobrevive ao F5.** Guardar a quebra no
  `localStorage` no mesmo relógio de 2 s, **sem** a porta do `quebraId` e **sem**
  a exigência de título. **Prova:** desenhar três componentes sem salvar,
  recarregar a página, e o desenho estar lá.
- **B — a recuperação é perguntada, nunca automática** (§2.2). **Prova:** o
  rascunho aparece como oferta; recusar deixa a tela como estava e não volta a
  perguntar.
- **C — o rascunho morre quando deixa de fazer sentido** (§2.3): salvou,
  descartou, ou envelheceu. **Prova:** salvar a demanda e recarregar não oferece
  recuperação de nada.
- **D — estourar o `localStorage` não derruba nada** (§3.2). **Prova:** com a
  escrita falhando, a tela continua utilizável e o autosave do servidor segue
  funcionando.
- **E — o logout apaga o rascunho** (§3.1). **Prova:** sair e entrar com outra
  pessoa não oferece o desenho da anterior.
- **F — a falha ao salvar para de ser discreta** (§3.4). **Prova:** com o
  servidor recusando, quem clicou em "Derivar Quebra" vê que não salvou no mesmo
  lugar em que vê os itens — e não só num status do header.
- **G — certificar contra o real.** Desenhar, matar a aba pelo gerenciador de
  tarefas (não pelo `Ctrl+W`, que dispara `beforeunload`) e reabrir. É a única
  fatia que prova as outras: é literalmente o *"ficar sem energia"* do pedido, e
  nenhum teste automatizado o reproduz.

---

## 6. Perguntas em aberto

1. **O print da origem é qual dos quatro caminhos da §1?** A resposta muda o
   tamanho da fatia F: se foi `somenteLeitura` ou o tour, ela é só uma frase na
   tela; se foi falha de salvamento engolida, é um defeito com nome.
2. **Guardar a quebra inteira ou só o diagrama e o que foi escrito à mão?**
   (§3.2) Inteira é mais simples e chega mais rápido no teto; recortada exige
   decidir o que se recalcula — e errar aí é perder trabalho no caso que a SPEC
   existe para cobrir.
3. **Quantos dias o rascunho sobrevive?** Um teto curto demais desprotege quem
   voltou na segunda-feira; longo demais deixa desenho velho oferecendo
   recuperação meses depois.
4. **Um rascunho por pessoa, ou um por demanda em andamento?** Hoje o fluxo
   tem uma demanda aberta por vez na tela, e um rascunho só basta. Se amanhã
   houver abas paralelas, dois rascunhos disputariam a mesma chave — e o segundo
   a escrever venceria em silêncio.
5. **A recuperação oferecida precisa dizer o que ela contém?** *"Um desenho de
   12 minutos atrás"* é fraco; *"srv-catalogo, produtos e mais 3 componentes"* é
   o que permite reconhecer se aquilo é o trabalho que se quer de volta.

---

## 7. O que já está pronto e a implementação reaproveita

- **`usePersistencia`** — o relógio de 2 s, o `beforeunload` e o
  `visibilitychange` já existem e já foram calibrados (SPEC-72 fatia B). A fatia
  A monta em cima, não ao lado.
- **`timeLembrado.ts`** — o molde de escrita em `localStorage` por pessoa, com
  o `try/catch` que trata storage desabilitado.
- **`useTema.ts`** — o precedente de escrita que falha sem derrubar a tela.
- **`aoAbrir`** — o evento *"troquei de demanda"*, que já limpa itens, painel e
  contexto. É onde a recuperação entra e onde o rascunho velho sai.
- **O teste de contrato de `usePersistencia`** — ele compara a quebra reaberta
  com a salva **inteira**, em vez de conferir campo escolhido. O comentário do
  §250 explica por que isso existe: *"cada campo novo da quebra foi esquecido
  aqui — reabrir a demanda apagava as fatias A, C e E inteiras, em silêncio"*.
  **O rascunho é um quinto funil pela mesma fresta**, e precisa entrar nesse
  mesmo teste — senão a próxima quebra a ganhar um campo o perde na recuperação.
