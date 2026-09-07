/**
 * SPEC-107 G5c-3 — **este spec MORREU com a tela de revisão** (§3.1, última
 * linha da tabela; JOURNEY §385).
 *
 * O que ele provava, e onde cada prova mora agora:
 * - barra de pendências + "Confirmar todas" → na SEÇÃO DOS ITENS do documento
 *   (`pendencias-dos-itens`/`confirmar-todas-itens`), provada ponta a ponta
 *   em `esteira-pela-fiacao.spec.ts` (a jornada da fiação) e nos testes de
 *   unidade da `DocumentoScreen`;
 * - a fila guiada ("revisar uma a uma") → morreu como superfície; o gesto
 *   equivalente é o refinador campo a campo no card (§384);
 * - o deep-link do documento para a revisão → perdeu o sentido: o julgamento
 *   mora no próprio card, e o chip de completude virou leitura.
 */
