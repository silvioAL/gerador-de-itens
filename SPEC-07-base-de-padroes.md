# SPEC-07 — Base de padrões crescente

**Depende de CONTEXTO-E-ARQUITETURA.md e SPEC-05.** Status: **desenho, não implementado**. Registrado antes de codar porque é a maior peça pendente e porque errar o modelo de dados aqui é caro de desfazer depois — a mesma razão pela qual SPEC-03 pediu uso real antes de replicar um schema.

> **Correção de escopo (achado em uso real, não em revisão de código):** o que este documento descreve é **só** estatística de valor de campo sobre o histórico de `quebra.json` do próprio sistema — o `Padrao` da §2 é `(nodeType, contextos, campo, valor, ocorrências)`, nada mais. É o sistema referenciando a si mesmo, de forma circular, desconectado da jornada real do desenvolvedor (abrir um projeto, interagir com o código, decidir guardar uma referência — idealmente selecionando classes/arquivos reais e guardando isso numa base de conhecimento). Isso continua sendo uma peça legítima e barata de implementar (reduz preenchimento repetido de campo), mas **não é** a "base de padrões do time" que resolve o pedido original — é um subconjunto menor dela.
>
> **Atualização (JOURNEY.md §17):** a peça que faltava — referências de código real, ancoradas na jornada de dev — ganhou uma primeira implementação, fora deste SPEC: aba "Referências de código" no modal de jornada, `config/referencias/` carregado em runtime (mesmo padrão de `config/cenarios/`), com formulário pra selecionar arquivos reais do projeto, escrever o racional, e baixar um rascunho pra colocar no repositório — revisável, nunca escrito em silêncio. Ainda não integra com Graphify pra apontar/selecionar classes já mapeadas (hoje a seleção é manual, via `<input type="file">`); isso continua em aberto como evolução natural, não como um SPEC novo à parte.
>
> **Atualização (JOURNEY.md §18.3-18.5):** o §13 abaixo ("curado à mão") também deixou de ser só edição direta de `perfis-time.json` fora da ferramenta — aba "Perfis de time" no mesmo modal, com formulário pra declarar/corrigir um valor (time + tipo de nó + campo do `FieldSpec` real + valor) e captura contextual direto de um nó no painel de propriedades. Ainda é curadoria explícita de alguém, nunca inferência estatística — não muda o argumento central deste SPEC, só fecha a lacuna de "onde eu edito isso" que SPEC-05 nunca teve UI nenhuma pra resolver.

---

## 1. O problema

`config/perfis-time.json` (SPEC-05) captura fatos estáticos que alguém decidiu curar à mão ("este time usa Java"). Mas a maior parte do conhecimento repetido de um time não é um fato estático — é um **padrão de uso**: "toda vez que desenhamos uma fila Rabbit consumida por mais de um serviço, acabamos usando `retryStrategy: backoff` e `queueType: quorum`". Ninguém curou isso conscientemente; emergiu de decisão repetida em quebras passadas. Hoje esse conhecimento não é reaproveitado — cada quebra nova recomeça do zero, mesmo quando a resposta já foi dada da mesma forma oito vezes seguidas.

Isto é, por nome, o subsistema de "padrões" que SPEC-01/02/03 excluíram de escopo deliberadamente desde o início — não porque não importasse, mas porque implementar isso sem primeiro ter uso real (e sem primeiro ter os schemas de SPEC-04 validados) seria adivinhar a forma dos dados antes de ter dado.

## 2. O que é um "padrão" aqui

```ts
interface Padrao {
  nodeType: string;              // ex.: "rabbit"
  contextos: string[];           // combinação de contextos observada (casamento igual ao de SPEC-05 §3.2)
  campo: string;                 // chave do FieldSpec
  valor: unknown;
  ocorrencias: number;           // em quantas quebras passadas esse valor apareceu para este campo, dado o mesmo nodeType+contexto
  totalObservado: number;        // em quantas quebras o campo apareceu preenchido (com qualquer valor), para este nodeType+contexto
  confianca: number;             // ocorrencias / totalObservado
  ultimaVez: string;             // data da quebra mais recente que contribuiu — padrão antigo não observado há muito tempo pesa menos
}
```

Um padrão é sempre **por combinação (nodeType, contextos, campo)** — não existe padrão "global" de um campo, porque o mesmo campo (`ack`, por exemplo) pode ter resposta diferente dependendo do contexto da fila.

## 3. De onde vêm os dados

Cada `quebra.json` já salva é a fonte. Não existe hoje uma convenção de "onde ficam as quebras passadas de um time" — precisa de uma antes de implementar. Proposta: um diretório (`quebras/` ou configurável) dentro do projeto alvo, versionado em git como qualquer outro artefato — nenhuma infraestrutura nova, é exatamente o modelo local-first já usado para a quebra atual (CONTEXTO-E-ARQUITETURA.md §5).

Comando novo do CLI (não implementado): `gerador padroes analisar <diretório-de-quebras> --out config/padroes.json`. Varre os `quebra.json` do diretório, agrega por `(nodeType, contextos, campo)`, escreve `config/padroes.json`. É um passo explícito, sob demanda — não um watcher, não algo que roda sozinho a cada salvamento (mesmo espírito de "Graphify não roda sozinho": automação sem gatilho explícito tende a surpreender).

## 4. Como um padrão vira sugestão — e por que **não** é o mesmo caminho do perfil de time

Esta é a decisão central deste documento. `perfilDoTime` (SPEC-05) é fato curado por uma pessoa — aceitar a sugestão grava `origem: "manual"` imediatamente, porque uma pessoa decidiu isso em algum momento, só não foi *esta* pessoa agora.

Um padrão é uma **inferência estatística sobre comportamento passado**, não uma decisão de ninguém. Confundir os dois violaria a proteção que a proveniência existe para dar (CONTEXTO-E-ARQUITETURA.md §4). Por isso:

- Aceitar uma sugestão de padrão grava `origem: "sugerido"`, `confianca` = a confiança do padrão, `confirmado: false`.
- Isso já entra automaticamente no fluxo que existe desde SPEC-01 §7: `sugerido` não confirmado não conta como preenchido, nó fica amarelo (nunca vermelho por causa disso), a pessoa vê o valor com tratamento visual mais forte e precisa confirmar ou descartar campo a campo.
- **Nenhuma UI nova é necessária para o pós-aceite** — o mecanismo de proveniência já construído (ProvenanceBadge, confirmarValor, descartarValor) já trata `sugerido` corretamente. O que falta é só a UI de **oferecer** a sugestão mostrando a evidência ("visto em 7 de 9 quebras anteriores"), para diferenciar de um default estático ou de um perfil de time.

## 5. Limiar de confiança

Um padrão só deveria ser oferecido como sugestão se:

- `totalObservado >= 3` (padrão de uma ou duas quebras é coincidência, não padrão).
- `confianca >= 0.7` (se o time decide de jeitos diferentes quase na metade das vezes, não é um padrão — é uma decisão genuína caso a caso, sugerir aqui atrapalha mais que ajuda).

Os dois números são candidatos a virar config (`config/padroes.json` poderia ter os thresholds usados na geração, para rastreabilidade de por que um padrão apareceu ou não).

## 6. O que fica de fora deste desenho (não-objetivos)

- **Nenhum compartilhamento entre projetos/times sem opt-in explícito.** Padrões são lidos de um diretório local; não existe telemetria, não existe "padrões da comunidade".
- **Nenhuma aplicação automática.** Mesmo um padrão com confiança 100% em 20 quebras nunca pula direto para `origem: "manual"` — passa por `sugerido` sempre, sem exceção. É a mesma proteção contra excesso de confiança que já existe para qualquer copiloto (SPEC-01 §4.3).
- **Nenhum ML.** Contagem e frequência simples são suficientes e são auditáveis — alguém consegue abrir `config/padroes.json` e entender exatamente por que uma sugestão apareceu. Um modelo estatístico mais sofisticado é complexidade que este problema não pede.

## 7. Fases (quando for implementado)

1. **`gerador padroes analisar`** — só o comando de análise, escrevendo `config/padroes.json`. Sem nenhuma mudança de UI ainda. Critério de pronto: rodar contra um conjunto real de quebras passadas e o humano concordar que os padrões reportados fazem sentido (mesmo critério de validação de SPEC-04 §8: uso real decide, não revisão de código).
2. **`resolverDefault` ganha um terceiro nível de fallback** (depois de `default` estático, depois de `perfilDoTime`): consulta `config/padroes.json` pela combinação `(nodeType, contextos, campo)` e retorna o valor de maior confiança acima do limiar, marcado para entrar como `sugerido`.
3. **UI**: `PropertiesPanel` distingue visualmente "sugestão de default", "sugestão de perfil de time" e "sugestão de padrão" (hoje as duas primeiras já são indistinguíveis na UI — nenhuma delas mostra a origem da sugestão, só o valor. Vale resolver isso na mesma leva, mostrando "visto em N quebras" para o padrão).

Nenhuma fase começa até (1) rodar contra dados reais e alguém confirmar que os padrões detectados são genuinamente úteis — o mesmo motivo pelo qual este documento é um desenho, não uma branch.
