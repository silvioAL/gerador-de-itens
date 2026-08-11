# SPEC-35 — Salvar configuração de prompt inválida recusa com o motivo

## 1. Pedido

Do usuário, com print da aba "Especificação de solução": *"isso precisa ser
revisado junto [ao Pipeline de IA], pois lá também existe configuração dos
prompts; obviamente precisamos planejar de forma que o sistema não quebre
devido a apagamento de configuração dos prompts — eliminar variáveis
obrigatórias, por exemplo, não deveria salvar, e sim alertar que é inválido e
mostrar o motivo"*.

## 2. Medições (o que acontece hoje)

1. **Template**: apagar `{{itens}}` salva sem aviso — o documento gerado perde
   o corpo em silêncio. Variável desconhecida é barrada SÓ na UI
   (`EspecificacaoTemplateTab`); a rota aceita `z.string().min(1)` e mais nada
   — o painel Configurar ou uma chamada de API salvam template inválido.
2. **Pipeline**: `sanearPapeis` descarta em silêncio papel sem `id` e `id`
   duplicado (salva 5, sobrevivem 4, ninguém avisa); papéis todos inválidos
   viram a esteira de fábrica sem aviso. Preâmbulo vazio herda o padrão — isso
   é desenho do #296 e continua correto.
3. **O mecanismo já existe pela metade**: `normalizarDocumentoConfig` +
   `ConfigInvalida` recusam `regras` sem `porTech` com 400 e motivo. Falta
   estender ao pipeline e criar o análogo para o template (que tem porta
   própria, fora de `config_documentos`).

## 3. Decisões

### 3.1 A borda recusa; a UI explica; a regra mora numa função só

Validação de escrita vive na camada de aplicação/engine e é IMPORTADA pela UI
— nunca reimplementada (a divergência silenciosa entre borda e tela é a classe
de defeito da SPEC-31). A rota devolve **400 com os motivos legíveis**; a tela
desabilita o salvar e lista os mesmos motivos antes mesmo do clique.

### 3.2 Leitura tolerante, escrita estrita

`sanearPapeis` continua saneando na LEITURA — config antiga ou editada à mão é
problema pra relatar, não pra explodir na exibição (decisão já registrada em
`normalizarNaLeitura`). O que muda é a ESCRITA: quando o corpo representa a
intenção do usuário e parte dela seria descartada, isso é erro com nome, não
normalização.

### 3.3 Template: obrigatória bloqueia; recomendada avisa

- **Erro (recusa)**: variável desconhecida (agora também na borda), e ausência
  de `{{itens}}` — sem ele o documento sai sem o corpo; não há leitura válida
  de um template de especificação sem os itens.
- **Aviso (salva, mas diz a consequência)**: ausência de `{{titulo}}`,
  `{{contexto}}`, `{{historiaPo}}`, `{{definitionOfReady}}`,
  `{{definitionOfDone}}` — template enxuto é escolha legítima, mas a pessoa
  precisa saber o que deixa de sair no documento (ex.: sem `{{contexto}}`, o
  texto do Contexto do épico não entra). Bloquear tudo engessaria; deixar mudo
  é o defeito atual.

### 3.4 Pipeline: o que seria descartado em silêncio vira 400

Na escrita de `pipeline-agentes`: papel sem `id`, `id` duplicado, e lista
`papeis` presente porém vazia (apagaria a esteira — quem quer a esteira de
fábrica remove a chave, e a mensagem diz isso). Preâmbulo vazio segue válido
(= herdar o padrão do grupo). O painel "⚙ Configurar" e qualquer chamada de
API herdam o portão de graça, porque ele mora na rota.

## 4. Fora de escopo, deliberado

- Validar o CONTEÚDO do preâmbulo (qualidade de prompt é do humano/IA, não do
  validador).
- Migrar o template de especificação para `config_documentos` — a porta
  própria funciona; unificação é outra conversa.

## 5. Verificação

Unit no engine (`problemasDoTemplate`) e na aplicação (`validarEscritaConfig`);
400 provado por `app.inject` nas duas rotas; UI com motivo visível em teste de
navegador; prova de mordida de cada portão (remover a validação deixa o teste
exato vermelho); validação final no bundle de produção.
