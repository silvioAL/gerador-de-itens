import { z } from "zod";

/**
 * SPEC-110 fatia G — **a operação de ajuste como esquema COMPARTILHADO.**
 *
 * A união vivia inline dentro de `POST /ajustes`. Agora um nó de fluxo
 * (`config-propor-ajuste`) propõe a mesma operação, e um segundo esquema
 * divergiria na primeira variante nova: a aba aceitaria o formato novo e a
 * fiação o recusaria, ou pior, o contrário — a fiação gravaria uma operação
 * que o `aplicar` não sabe executar.
 *
 * O esquema não mudou de forma nesta mudança: ele mudou de LUGAR (§263).
 */

const campoProposto = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "a chave do campo aceita letras, números, hífen e underscore"),
  label: z.string().trim().min(1),
  tipoCampo: z.enum(["text", "textarea", "number", "boolean", "select"]),
  obrigatorio: z.boolean().default(false),
  ajuda: z.string().trim().optional(),
  opcoes: z.array(z.string()).optional(),
});

/**
 * A mudança como DADO (SPEC-45): é ela que permite APROVAR e aplicar, em vez
 * de gravar um texto que alguém teria de traduzir à mão depois.
 */
export const operacaoDeAjuste = z.discriminatedUnion("tipo", [
          // SPEC-46 — as quatro seções das regras de refinamento. `secao`
          // opcional: pedido gravado antes desta fase continua aplicável.
          z.object({
            tipo: z.literal("adicionar-checklist"),
            secao: z.enum(["checklistTecnico", "checklistProcesso"]).optional(),
            tech: z.string().min(1),
            contextos: z.array(z.string()).default([]),
            texto: z.string().trim().min(1),
          }),
          z.object({
            tipo: z.literal("remover-checklist"),
            secao: z.enum(["checklistTecnico", "checklistProcesso"]).optional(),
            tech: z.string().min(1),
            texto: z.string().trim().min(1),
          }),
          z.object({
            tipo: z.literal("adicionar-teste"),
            tech: z.string().min(1),
            contextos: z.array(z.string()).default([]),
            tipoTeste: z.string().trim().min(1),
            validacao: z.string().trim().min(1),
            dev: z.boolean().default(true),
            hlg: z.boolean().default(false),
          }),
          z.object({ tipo: z.literal("remover-teste"), tech: z.string().min(1), tipoTeste: z.string().trim().min(1) }),
          z.object({
            tipo: z.literal("definir-volumetria"),
            tech: z.string().min(1),
            contextos: z.array(z.string()).default([]),
          }),
          z.object({ tipo: z.literal("remover-volumetria"), tech: z.string().min(1) }),
          // SPEC-63 — a régua sobre a FORMA do desenho. `id` é obrigatório e
          // vem do cliente porque é a chave estável a que as exceções se
          // prendem: gerá-lo aqui faria o mesmo pedido aplicado duas vezes
          // criar duas regras, e as exceções se dividiriam entre elas.
          z.object({
            tipo: z.literal("adicionar-topologia"),
            requisito: z.object({
              id: z.string().trim().min(1),
              texto: z.string().trim().min(1),
              porque: z.string().trim().optional(),
              checagem: z.discriminatedUnion("tipo", [
                z.object({
                  tipo: z.literal("exige-conexao"),
                  tipoNo: z.string().min(1),
                  direcao: z.enum(["entra", "sai"]),
                  tipoAresta: z.string().min(1).optional(),
                  tipoNoOposto: z.string().min(1).optional(),
                }),
                z.object({
                  tipo: z.literal("proibe-conexao"),
                  deTipoNo: z.string().min(1),
                  paraTipoNo: z.string().min(1),
                  tipoAresta: z.string().min(1).optional(),
                }),
                // SPEC-67 — o padrão como quantidade. `int().nonnegative()`
                // porque máximo fracionário ou negativo é régua que nenhum
                // desenho satisfaz; zero é legítimo ("nenhuma chamada
                // síncrona daqui").
                z.object({
                  tipo: z.literal("limita-grau"),
                  tipoNo: z.string().min(1),
                  direcao: z.enum(["entra", "sai"]),
                  maximo: z.number().int().nonnegative(),
                  tipoAresta: z.string().min(1).optional(),
                  apenasQueEsperam: z.boolean().optional(),
                }),
              ]),
            }),
          }),
          z.object({ tipo: z.literal("remover-topologia"), id: z.string().min(1), texto: z.string().optional() }),
          // SPEC-50 — papel da esteira: o outro documento que o feedback cita.
          z.object({ tipo: z.literal("ativar-papel"), papelId: z.string().min(1), papelNome: z.string().optional() }),
          z.object({ tipo: z.literal("desativar-papel"), papelId: z.string().min(1), papelNome: z.string().optional() }),
          // SPEC-52 — a ficha do componente e a da conexão.
          z.object({ tipo: z.literal("adicionar-campo-no"), tipoNo: z.string().min(1), campo: campoProposto }),
          z.object({
            tipo: z.literal("remover-campo-no"),
            tipoNo: z.string().min(1),
            key: z.string().min(1),
            label: z.string().optional(),
          }),
          z.object({ tipo: z.literal("adicionar-campo-aresta"), tipoAresta: z.string().min(1), campo: campoProposto }),
          z.object({
            tipo: z.literal("remover-campo-aresta"),
            tipoAresta: z.string().min(1),
            key: z.string().min(1),
            label: z.string().optional(),
          }),
]);

export type OperacaoProposta = z.infer<typeof operacaoDeAjuste>;
