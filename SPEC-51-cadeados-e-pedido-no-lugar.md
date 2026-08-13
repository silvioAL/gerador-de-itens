# SPEC-51 — O menu diz o que se pode, e o pedido nasce onde a permissão barra

> Junta duas fases que sobraram e são a mesma ideia por dois ângulos:
> SPEC-40 Fase 2 ("filtro/cadeados por nível+RBAC no menu, pedir ajuste") e
> SPEC-39 Fase 2 ("solicitação nascendo do 403").

## 1. O defeito silencioso

O menu mostrava todas as áreas; a `ConfigScreen` escondia as negadas e caía
na **primeira visível**. Quem clicava em "Modelo de IA" ia parar em
"Membros" sem uma palavra — e concluía que o produto estava quebrado, não
que faltava permissão.

## 2. O que muda

- **Menu com cadeado**: item que a pessoa não edita vem com 🔒 e um title
  que diz o porquê. Continua clicável de propósito: é lá que se pede.
- **Área negada DIZ que é permissão**, em vez de trocar de tela.
- **O pedido nasce ali**: uma caixa de texto vira solicitação de ajuste com
  o recurso já preenchido, e cai na fila do PDCA (SPEC-45) com prévia e
  aprovação. O caminho existia — a entrevista do agente — mas longe do
  momento em que a pessoa quer a mudança.
- **Nem tudo se pede**: acessos, membros e credenciais são decisão de quem
  administra, não ajuste de configuração. Para essas a tela manda falar com
  um owner, sem oferecer um botão que não resolveria.

## 3. Feito quando

1. Área negada não troca mais de tela em silêncio.
2. Pedir dali cria a solicitação com o recurso certo (com mordida).
3. Menu marca o que é bloqueado sem esconder o caminho.
