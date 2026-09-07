/**
 * SPEC-107 G5c-3 — **este spec MORREU com a tela de revisão** (§3.1: "o
 * código client-side de simulação" está na coluna do que morre; JOURNEY §385).
 *
 * O que ele provava: "ver o prompt que sairia, sem gastar IA" (#299). A letra
 * do prompt continua guardada — pelos testes de anatomia do montador na
 * aplicação (`pedidos.anatomia.test.ts`, o MESMO `montarPedidoPipeline` da
 * fiação, §263) e pelo dublê determinístico (a assinatura ⟨hash⟩ do prompt
 * nos valores, `esteira-pela-fiacao.spec.ts`).
 *
 * Dívida declarada: um "simular" da FIAÇÃO (dry-run no canvas, mostrando o
 * prompt por nó) não existe — se fizer falta, é rodada própria, no executor.
 */
