# SPEC-11 — Landing page pública

**Depende de SPEC-09-autenticacao-de-producao.md** · Fica na frente da tela de login (SPEC-08 §2, `packages/web/src/auth/LoginScreen.tsx`), não a substitui.

---

## 1. Objetivo

O usuário sentiu falta de contexto antes da tela de login — hoje `App()` cai direto num formulário (e-mail + time em modo dev, ou redireciona direto pro Google em modo oidc) sem nenhuma explicação do que é a ferramenta, pra quem chega sem saber. Uma landing page pública resolve isso: explica o que o "Gerador de Itens" é antes de pedir qualquer credencial.

## 2. Onde ela entra no fluxo

`App()` (`packages/web/src/App.tsx`) hoje decide entre `LoginScreen` (sem sessão) e o app carregado (com sessão) — ganha um terceiro estado antes desses dois: a landing, mostrada por padrão pra quem chega em `/` sem sessão, com um botão "Entrar" que troca pra `LoginScreen`. Quem já tem sessão válida (`GET /auth/me` 200) pula a landing direto pro app — a landing é só pra quem ainda não provou quem é, nunca uma parede extra pra quem já está autenticado.

## 3. Conteúdo — reaproveita, não reescreve

A explicação de "como funciona" já existe e já é boa: a aba "A jornada" da `JourneyModal` (`packages/web/src/demo/JourneyModal.tsx`, componente `Jornada()`, as 5 etapas diagrama→prontidão→derivar→revisão→saídas) foi escrita pra exatamente esse público (alguém que não conhece a ferramenta ainda). A landing pública reaproveita esse mesmo componente `Jornada()` — extraído pra um módulo compartilhado (`packages/web/src/demo/Jornada.tsx`, sem mudar o conteúdo) — em vez de escrever uma segunda explicação que só vai dessincronizar da primeira com o tempo.

Acrescenta só o que é específico de landing pública (não fazia sentido dentro da modal, que já pressupõe alguém com sessão): título/tagline curto, e um botão "Entrar" levando pra `LoginScreen`.

## 4. O que não fazer

- Não duplicar a explicação de "como funciona" — um componente `Jornada()` só, usado nos dois lugares (landing pública e aba dentro do app).
- Não transformar a landing numa segunda camada de autenticação/verificação — ela é conteúdo estático público, não decide nada sobre sessão além de existir só quando não há uma.
- Não bloquear quem já tem sessão válida atrás da landing — sessão existente pula direto pro app.
