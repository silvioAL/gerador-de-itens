# SPEC-49 — Exportação dos itens para o tracker (a Fase 2 da SPEC-41)

> Origem: a SPEC-41 criou a porta `ExportadorDeItens` com contrato e deixou
> o adaptador para depois; a tela promete "a exportação pro seu tracker
> (Jira etc.) chega na próxima fase". O pedido original: "um adaptador que
> faz chamadas para um agente do MCP que faz o upload para o Jira ou outro
> issue tracker".

## 1. O adaptador

O gerador **não fala Jira** — fala com um AGENTE que fala. É a mesma
disciplina do gateway de IA: o produto não implementa provedor, chama um
endereço configurável. `POST {endpoint}` com `{ itens: [...] }` e a
resposta diz, por item, `linkExterno` ou `erro`. Assim serve MCP bridge,
n8n, função interna — qualquer coisa que a empresa já tenha.

Configuração (documento `exportador`): endereço, cabeçalhos (token) e um
rótulo do destino ("Jira do time X") pra tela dizer pra onde vai.

## 2. Regras

- Exporta **só item pronto** (nenhum `✍️ especificar`, nenhuma sugestão sem
  confirmação): a régua da SPEC-44/47 decide o que pode sair. Item com
  pendência não vira issue meia-boca.
- Falha é **por item**: quem exportou fica `exportado` com o link; quem
  falhou continua `gerado` e a tela diz o motivo. Nunca tudo-ou-nada.
- Reexportar item já exportado não duplica: o rastro (`chave` → link)
  sobrevive à regeneração (já garantido na SPEC-41).

## 3. Feito quando

1. `POST /quebras/:id/itens/exportar` exporta os prontos e grava
   estado/link; erro por item aparece na resposta.
2. A tela dos itens escritos tem "Exportar prontos (N)" e o card exportado
   mostra o link.
3. Sem exportador configurado, a tela DIZ isso e aponta a configuração.
4. Testes com mordida; E2E contra um agente falso; smoke no bundle.
