# SPEC-74 — O modo sem custo

> **Origem:** o usuário, no meio de outra conversa:
>
> > *"quanto ao budget que esgotou para api, vc vai precisar montar mocks para
> > que possamos seguir trabalhando sem gastar tokens."*

---

## 0. A boa notícia, medida antes de propor qualquer coisa

**Quase tudo já existe.** Duas medições:

**1. A credencial já é por time e aponta para onde se mandar:**

```ts
// packages/llm/src/credenciais.ts
{ baseUrl?: string; chave: string; modelo: string; baseUrlTranscricao?: string }
```

`baseUrl` é configurável pela tela. Apontá-lo para um servidor local **não exige
uma linha de código nova**.

**2. O gateway falso já existe, e é completo:**

`packages/web/e2e/gatewayFalso.ts` — 229 linhas, já cobre `/chat/completions`
(inclusive streaming) e `/audio/transcriptions`, e já sabe simular falha sob
comando. A suíte E2E inteira roda hoje sem tocar em modelo nenhum.

> O trabalho desta SPEC é de **empacotamento**, não de invenção. O que falta é
> promover um utilitário de teste a modo de desenvolvimento de primeira classe.

## 1. O que falta, e é pouco

**1.1 Ele não sobe fora do E2E.** Vive no `webServer` do Playwright. Quem roda
`docker compose up` para trabalhar não o tem.

**1.2 Ele responde o suficiente para o teste, não para o uso.** As respostas são
fixas e curtas — provam o mecanismo. Quem desenvolve uma tela de IA passa a ver
sempre o mesmo texto, e não consegue avaliar layout, quebra de linha, texto longo
ou lista com muitos itens.

**1.3 Nada diz que é falso.** Se o modo entrar sem marca, a primeira captura de
tela vira "olha o que a IA respondeu" — e é o §235 outra vez, que precisou de uma
marca de demonstração exatamente por isso.

## 2. O desenho

**2.1 Um serviço no compose**, atrás de um perfil (`--profile sem-custo`), que
sobe o gateway falso na rede da stack. Sem perfil ligado, nada muda para quem já
usa a ferramenta com modelo real.

**2.2 Respostas plausíveis POR TIPO de pedido.** O gateway olha o que foi pedido
(propor diagrama, propor necessidades, sugerir cenários de ensaio, refinar item,
transcrever) e devolve algo com a **forma certa e tamanho realista** — não um
"ok". É isso que faz o modo servir para desenvolver tela, e não só para não
quebrar.

**2.3 A marca.** Toda resposta vinda do modo sem custo chega marcada, e a tela a
mostra — a mesma disciplina de proveniência que o produto aplica a tudo
(`origem: "sugerido"`, marca de demonstração, "escrito por uma pessoa").

**2.4 Latência simulada, opcional.** Resposta instantânea esconde os estados de
espera — e o produto tem animação de "construindo" que só se avalia com atraso.

## 3. O que NÃO entra

**Um modelo local (Ollama) como "o mock".** Já existe no compose e serve a outro
propósito: rodar de verdade, com custo zero de API mas custo alto de máquina.
Não é o que o pedido descreve — e ele não é determinístico, então não substitui
mock em teste.

**Gravar e reproduzir respostas reais (VCR).** Seria o mais fiel, e é caro:
precisa de captura, sanitização de dado sensível e um arquivo por cenário. Fica
recusado até alguém precisar de fidelidade que a resposta sintética não dá.

**Mock no cliente.** O ponto de troca certo é o `baseUrl`, porque ele exercita o
caminho inteiro — rota do servidor, streaming, tratamento de erro. Um mock no
cliente pularia justamente o que mais quebra.

## 4. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | O gateway falso sai do E2E e vira pacote próprio, sem regressão na suíte | os 102 E2E continuam passando |
| **B** | Serviço no compose sob perfil, com o `baseUrl` documentado | `docker compose --profile sem-custo up` e a ferramenta responde sem chave real |
| **C** | Respostas por tipo, com forma e tamanho realistas | unitário: cada tipo de pedido devolve a estrutura que o cliente espera |
| **D** | A marca de "resposta simulada" na tela | a tela diz que é simulada, e o documento gerado também |

**A antes de B:** enquanto ele viver dentro do E2E, mexer nele arrisca a suíte —
e a suíte é a rede de segurança de todo o resto.

## 5. Perguntas em aberto

1. **A marca deve impedir a exportação ao tracker?** Recomendação: **não
   impedir, mas marcar** — item exportado com conteúdo simulado precisa dizer
   isso, ou vira dado real no backlog de alguém.
2. **O perfil deve ser o padrão em desenvolvimento?** Recomendação: **sim**, e é
   a decisão que economiza dinheiro de verdade — quem quer modelo real liga
   explicitamente. Mas é decisão do usuário, não minha.
3. **As respostas sintéticas devem variar?** Texto sempre igual é bom para teste
   e ruim para avaliar tela. Recomendação: variação determinística por hash do
   pedido — reprodutível e não monótona.
