# SPEC-45 — A jornada do PDCA: do feedback à configuração mudada

> Origem (§194): "preenchi o feedback no agente e não vi nenhuma ação na
> aplicação para avaliar/melhorar as configurações". Medido: `POST
> /pdca/feedback` grava e **não existe GET** — ninguém lê, nunca. O outro
> caminho (entrevista → `/ajustes`) mora escondido em *Acessos* e termina
> na aprovação: aprovar não muda configuração nenhuma. O produto faz o
> *Plan* e o *Do* do PDCA e para.
>
> Pedido: "uma jornada consistente, onde aparecem os feedbacks e o usuário
> consegue gerar sugestões, revisar e alterar configurações de forma
> simples e com o apoio do assistente".

## 1. A jornada, em uma tela

`#/config/pdca` deixa de ser "dois campos de cadência" e vira a tela do
ciclo, na ordem em que se anda:

1. **O que disseram** — os feedbacks recebidos (texto, quem, quando, time)
   com estado `novo | virou-ajuste | descartado`. É o *Check* que não
   existia.
2. **Virar sugestão** — por feedback: **✨ Propor ajuste** (o assistente
   redige a mudança concreta a partir do texto, streamando) ou escrever à
   mão; escolhe-se o recurso alvo; salvar cria a solicitação JÁ ligada ao
   feedback (que passa a `virou-ajuste`). Ou **Descartar**, com o estado
   ficando registrado — decidir não tratar também é decisão.
3. **Revisar** — as solicitações saem de *Acessos* (que é permissão, não
   melhoria) e moram aqui: pendentes primeiro, com Aprovar/Recusar e a
   regra de validade que já existe (config mudou → `invalida`).
4. **Alterar** — a aprovada ganha **Abrir a configuração ↗** (deep-link pra
   área do recurso, padrão SPEC-40) e **Marcar como aplicada**, que fecha o
   ciclo com quem/quando. Sem IA editando documento de time sozinha: o
   humano aplica, o sistema rastreia.
5. **Cadência** — continua, agora como o ajuste fino do ciclo, no fim.

## 2. O assistente na jornada

- Momento novo **M15**: com feedback `novo` sem tratar, o balão diz
  "há N feedbacks esperando — quer transformar em ajustes?" e leva à tela.
- Dentro do card, o **✨** usa a mesma esteira de sugestão do resto do
  produto (`/ia/sugerir`) com o feedback como contexto: o texto proposto
  entra editável, nunca aplicado direto.

## 3. Dados

Migração 0027: `pdca_feedback` ganha `estado` (default `novo`) e
`solicitacao_id`; `solicitacoes_ajuste` ganha `aplicada_em`/`aplicada_por`
e o estado `aplicada`. Rotas novas: `GET /pdca/feedback`,
`POST /pdca/feedback/:id/descartar`, `POST /ajustes/:id/aplicada`;
`POST /ajustes` passa a aceitar `feedbackId`.

## 4. Feito quando

1. O feedback preenchido no agente APARECE na tela do PDCA.
2. Dá pra virar solicitação em dois cliques, com o assistente redigindo.
3. Aprovada leva à configuração e fecha como `aplicada`, com rastro.
4. Testes com mordida (a ponte feedback→ajuste e o gate do aplicar), E2E do
   ciclo inteiro e smoke no bundle.
