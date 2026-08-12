# SPEC-40 — Navegação: menu (☰), telas específicas com rota e o fim da régua de abas

> Origem (§186): "as transições entre as tabs de Configurações parecem cruas,
> imediatas, brutas — e a análise precisa contemplar o que faz sentido
> aparecer para cada perfil". O debate concluiu que o incômodo é ESTRUTURAL:
> a tela de Configurações é um contêiner de 10 formulários trocados por
> estado, sem rota, num app cujo header mistura ações de todo minuto com
> ações de uma vez por semana. Animar o swap trataria o sintoma; esta SPEC
> trata a causa.

## 1. Diagnóstico (medido no código)

1. **Header com hierarquia de frequência invertida** — paleta de ~12 tipos,
   Nova/Abrir/Salvar/Derivar, time, sessão, cenários/tour e Configurações
   disputam a mesma faixa; nos prints reais o header quebra em duas linhas.
2. **Configurações não é um lugar** — 10 abas planas (pessoas, padrões
   técnicos e IA misturados), troca por `useState` sem rota nenhuma no app
   (só `?convite=` na URL): F5 volta pro canvas, não existe link para
   "Membros", e os condutores (M4/M8/tour/PDCA) navegam por repasse de props
   (`abrirConfigNaAba`).
3. **Falsa affordance por perfil** — as abas só somem via RBAC (desligado no
   caso comum); os níveis da SPEC-38 não participam: `operar`/`visualizar`
   veem os 10 formulários e descobrem o limite no 403.

## 2. Princípios da solução

- **Frequência no header, gestão no menu.** O fluxo primário (desenhar →
  derivar → revisar) NUNCA entra no menu. O hambúrguer guarda exatamente o
  que convém esconder: navegação secundária.
- **O valor está nas telas com rota, não no ícone.** Cada área vira uma TELA
  específica com rota hash própria — F5 mantém o lugar, agente e tour
  navegam por link, transição vira mudança de página (uma só, consistente),
  E2E ancora em URL.
- **O menu é a lista do que ESTA pessoa pode fazer.** O filtro de perfil
  (nível SPEC-38 + RBAC SPEC-28) mora no menu: o de um `operar` é curto, o
  de um owner é completo. Cadeado visível (com "pedir ajuste" do PDCA §183)
  para os padrões; esconder só o sensível (Acessos).

## 3. Desenho

### 3.1 Header do canvas (enxuto)

`[☰ Menu]` · paleta de componentes · prontidão · Salvar · Derivar · (FAB do
agente segue flutuante). Saem do header: Nova, Abrir…, "Como funciona &
cenários", seletor de time, e-mail/Sair, Configurações — todos para o menu.
O rótulo "Menu" acompanha o ícone (mitigação do custo de descobribilidade
do hambúrguer), e o tour ganha um passo sobre ele.

### 3.2 Drawer (☰) — grupos por intenção, filtrados por perfil

| Grupo | Itens | Quem vê |
|---|---|---|
| Demanda | Nova quebra · Abrir… · Cenários & tour | todos |
| Padrões do time | Perfis de stack · Padrões por componente · Campos de conexão · Regras de refinamento · Especificação de solução | owner/delegados editam; `operar` vê com 🔒 + "pedir ajuste" (PDCA); `visualizar` vê em modo leitura |
| Pessoas & acesso | Membros · Acessos (papéis + solicitações do PDCA) | Membros: todos (ações gated); Acessos: owner ou grant — some para os demais |
| IA | Pipeline de agentes · Modelo de IA · Cadência do PDCA | owner/admin; 🔒 para operar |
| Rodapé | time ativo (trocar) · e-mail · Sair | todos |

### 3.3 Telas específicas com rota hash

- Rotas: `#/` (canvas) · `#/config/perfis-stack` · `#/config/componentes` ·
  `#/config/conexoes` · `#/config/regras` · `#/config/especificacao` ·
  `#/config/membros` · `#/config/acessos` · `#/config/pipeline` ·
  `#/config/modelo-ia` · `#/config/pdca`. Sem lib de router: hash +
  `hashchange` (o app não tem rotas hoje; hash preserva o deploy estático).
- Cada tela: cabeçalho próprio (← voltar · título · descrição de uma linha)
  e o CORPO REUSA o componente de aba atual (MembrosTab, RegrasTab, …) —
  a moldura de abas (`ConfigScreen`) morre; os componentes ficam.
- Transição única de página (deslize lateral ~140ms) — a suavidade vem de
  ser uma página, não um formulário trocado dentro de um contêiner.
- Condutores atualizados: M4 abre `#/config/modelo-ia`, M8 o drawer/tela de
  padrões, PDCA a tela de regras; tour navega por rota.

### 3.4 O que NÃO muda

Canvas, revisão (tela cheia como é), FAB/agente e todos os fluxos das
SPEC-37/39. A revisão continua fora do menu (é fluxo primário).

## 4. Fases

- **Fase 1 — a estrutura**: rotas hash, drawer com os grupos, telas
  específicas reusando as abas, header enxuto, condutores/tour/E2E migrados.
  A régua de abas morre aqui.
- **Fase 2 — o perfil**: filtro/cadeados por nível+RBAC no menu, "pedir
  ajuste" nos cadeados, banner de modo leitura para `visualizar`, Acessos
  escondida sem grant/owner.
- **Fase 3 — polimento**: transições finas, estados de foco/teclado do
  drawer (Esc fecha, setas navegam), skeletons por tela.

## 5. Feito quando

1. F5 em `#/config/membros` reabre Membros; o link colado em outra aba do
   navegador cai direto na tela certa.
2. O header do canvas não quebra linha em 1440px com a paleta inteira.
3. O drawer de um `operar` mostra Padrões com 🔒 e "pedir ajuste"; o de um
   owner mostra tudo; Acessos não aparece para quem não pode.
4. M4 navega por rota até Modelo de IA; o tour percorre o menu.
5. Prova de mordida no filtro por perfil do menu e na resolução de rota.
