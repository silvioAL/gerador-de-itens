# SPEC-41 — Fidelidade do documento e itens gerados dentro da ferramenta

> Origem (§188, pré-aprovado): o markdown da especificação sai com conteúdo
> FALTANTE em relação ao que já está preenchido (histórias viram "(sem
> história definida)", e o marcador "✍️ especificar" sobra ao lado de
> respostas presentes). E a evolução natural: a ferramenta gera os PRÓPRIOS
> itens (work items) internamente; depois, um adaptador MCP faz o upload
> para Jira/issue tracker. UX de primeira: a experiência deve ser incrível.

## 1. Parte A — fidelidade do documento (defeito)

Causa medida: `respostaVisivel` (engine) só admite `origem === "manual"` ou
`confirmado === true` — o DOCUMENTO descarta as sugestões da esteira não
confirmadas, que é exatamente "o que já é preenchido" na ficha. E o
renderizador imprime `<- ✍️ especificar` junto de respostas presentes.

Regra nova do RENDER (a prontidão não muda — confirmação humana continua
sendo o que "refina"):
- resposta confirmada/manual → valor limpo;
- resposta SUGERIDA (esteira, não confirmada) → valor + `_(sugerido pela
  esteira — confirmar)_`;
- sem resposta → o placeholder `✍️ especificar` (único caso em que aparece).

## 2. Parte B — itens gerados dentro da ferramenta

- Entidade `itens_gerados` por quebra: {id, quebra_id, chave, titulo, tipo,
  tamanho, dependencias, corpo_markdown (a seção do item no documento),
  estado: gerado|exportado, criado_em}. Gerar é REGERAR: substitui o
  conjunto da quebra (mesma versão da especificação — §184).
- Ação do agente na revisão (M7/M12 ganham "Gerar itens" ao lado de "Gerar
  especificação"): materializa os itens e abre a TELA de itens.
- **UX (o coração)**: tela própria `#/itens` da quebra — cards por item com
  título, tipo/tamanho, badges de dependência, corpo expansível, estado
  (gerado/exportado) e a régua de completude (quantos `✍️` restam no corpo:
  o card DIZ se o item está pronto pra exportar). Transição consistente com
  a SPEC-40; vazio bem escrito; o balão conduz ("os N itens estão prontos —
  quer revisá-los ou exportar?").
- **Exportação (Fase 2)**: porta `ExportadorDeItens` (aplicacao) com
  adaptador MCP → agente que sobe pro Jira/tracker; estado vira `exportado`
  com o link externo. A porta nasce na Fase 1; o adaptador MCP na Fase 2.

## 3. Feito quando

1. (A) Documento com sugestão da esteira mostra o valor com a marca de
   sugerido; confirmada sai limpa; `✍️ especificar` só em campo vazio.
   Mordida no gate do render.
2. (B) "Gerar itens" cria/regenera os itens persistidos; a tela `#/itens`
   lista com completude; E2E do ciclo gerar→revisar itens.
3. Porta de exportação definida com teste de contrato; MCP na Fase 2.
