# SPEC-52 — O ajuste também aplica nos campos (por componente e por conexão)

## 1. O problema

O ciclo do PDCA (SPEC-45/46/50) fecha sozinho para dois documentos: as regras
de refinamento e a esteira de agentes. Feedback vira operação, a operação tem
prévia, quem decide aprova, e o *Act* acontece sem ninguém reescrever nada à
mão.

Para **campos por componente** e **campos por conexão** o ciclo para na metade.
O pedido nasce (a SPEC-51 até fez o pedido nascer da tela negada, com o recurso
já preenchido), alguém aprova — e aí a solicitação fica parada com um aviso de
"abra a configuração e edite à mão". Quem aprovou já entendeu e concordou; o
trabalho manual que sobra é onde o ciclo perde gente.

E é justamente o pedido mais comum: "falta um campo de SLA no serviço",
"esse campo de volumetria não serve para conexão síncrona".

## 2. Por que não saiu junto

As regras e o pipeline são **documentos** em `config_documentos`: um JSON com
uma versão (`atualizadoEm`), aplicado por uma função pura que devolve
documento novo. É isso que dá prévia, validade e idempotência de graça.

Campos por componente e por conexão são **tabelas** (`campos_no`,
`campos_aresta`), com chave natural (`timeId`, `tipoNo`, `key`), escopo global
sobrescrevível por time, e casos de uso próprios. Não há documento para
versionar nem função pura para aplicar. A frase que ficou no código diz isso
com todas as letras: *"Recurso sem documento (campos-no) fica sem versão."*

## 3. A decisão

Manter a mesma disciplina — **a operação é dado, a prévia é função pura, a
aplicação é determinística** — sem fingir que a tabela é um documento.

### 3.1 Operações novas

Quatro, na mesma união discriminada:

- `adicionar-campo-no` / `remover-campo-no` (`tipoNo`, `key`)
- `adicionar-campo-aresta` / `remover-campo-aresta` (`tipoAresta`, `key`)

O campo de tipo chama-se `tipoCampo`, não `tipo` — `tipo` é o discriminante da
união e reusar o nome tornaria a operação impossível de estreitar.

**Limite consciente:** `type: "lista"` fica de fora. Uma lista carrega
`itemSpec` (sub-campos com chave, rótulo, tipo e opções), e isso é uma
estrutura para editar na tela de campos, não para nascer de um pedido escrito a
partir de um feedback. Pedido de lista continua sendo texto, e a tela manda
editar à mão — o que a §202 já decidiu para acessos: **nem tudo se aplica
sozinho**.

### 3.2 Uma régua só entre prévia e aplicação

`aplicarOperacaoNosCampos(campos, op)` é pura e devolve a ficha nova. A tela
usa para mostrar o antes/depois, e o **servidor usa a mesma função**: lê os
campos do escopo, aplica, e persiste a diferença (`diferencaDeCampos`). O que
a pessoa viu na prévia é literalmente o que o servidor calcula — não duas
implementações que combinam por enquanto.

### 3.3 Escopo: o campo nasce no time do pedido

A permissão foi checada com o escopo do time da solicitação, então é nesse
escopo que o campo nasce. Pedido sem time cria campo global.

E a recíproca, que é a regra de segurança que importa: **um pedido de time não
apaga campo de todo mundo**. Se o alvo da remoção só existe no escopo global, a
aplicação recusa com o motivo explícito, em vez de silenciosamente apagar para
a organização inteira a partir de um pedido que só um time discutiu.

### 3.4 Validade sem versão de documento

Não há `atualizadoEm` para comparar, então a validade por versão (SPEC-39) não
se aplica a estes dois recursos. O que protege aqui é a **idempotência**, a
mesma das regras: adicionar o que já existe é no-op, remover o que não existe é
no-op. Aprovar duas vezes não duplica campo; aprovar um pedido cujo campo já
foi criado à mão não quebra nada.

Isso é mais fraco que a validade por versão, e é uma escolha: inventar uma
versão sintética para a tabela seria um mecanismo novo para um risco que a
idempotência já cobre.

## 4. Fases

1. **Engine** — as quatro operações, `recursoAlvoDaOperacao` ampliado,
   `descreverOperacao`, `aplicarOperacaoNosCampos` e `diferencaDeCampos`.
2. **Servidor** — `/ajustes/:id/aplicar` alcança os dois recursos pelos casos
   de uso, com a recusa de escopo da §3.3.
3. **Web** — o estúdio de ajuste ganha os dois alvos, com a prévia mostrando a
   **ficha do componente** antes/depois (para campos, o item de exemplo não é a
   pergunta certa: o que muda é o que a pessoa vai ter que preencher).
