# SPEC-29 — Um modelo por agente: provedores internos, externos e a custódia da credencial

> **Status**: desenho, implementação não iniciada. Nasce do pedido: *"o usuário vai poder configurar que determinado agente vai rodar com seu Claude pessoal, outro com DeepSeek e escolher o modelo — isso também entra na questão de gestão de acessos. Alguns têm um endpoint interno por questão de segurança para acessar os modelos (wrapper)."*
>
> Depende de [SPEC-28](SPEC-28-gestao-de-acessos.md) (quem pode configurar o quê) e continua a [SPEC-25](SPEC-25-selecao-de-modelo-e-provedores.md) §5.6 (Jornada D — provedor por papel), cuja Fase 2 já entregou o `ProvedorCompativelOpenAI`.

## 1. O achado que reorienta a feature

O usuário propôs, com a ressalva de não ter certeza: *"é natural autenticação externa, por exemplo (abre no navegador, usuário autentica na página do modelo e segue usando)"*, e pediu para pesquisar.

**Pesquisado: esse caminho não existe para nós, e num dos casos é proibido.**

- **Anthropic** — em **fevereiro de 2026** a política de "Authentication and credential use" passou a dizer explicitamente que o fluxo OAuth (planos Free/Pro/Max) é **exclusivo do Claude Code e do claude.ai**. Usar token OAuth em ferramenta de terceiro **viola os Termos de Serviço**. O caminho suportado para aplicação de terceiro é **API key do Console**.
- **OpenAI** — não existe `/oauth/authorize` na API de plataforma: nenhum fluxo padrão emite chave cobrada na conta do usuário. O "Sign in with ChatGPT" é **identidade**, e até 2026 só dentro do tooling do Codex.

Ou seja: **"o usuário autentica na página do modelo e o app passa a chamar por ele" não é uma opção disponível** — não por limitação nossa, por decisão dos provedores. Insistir nisso levaria a ferramenta a um lugar que, no caso da Anthropic, é violação de contrato do próprio usuário.

O que sobra, e é o que esta SPEC desenha: **a credencial é uma chave**, e o problema real passa a ser **custódia** — que é onde a intuição do usuário sobre vault/Infisical estava certa.

## 2. Objetivo

1. Cada agente da esteira roda no provedor/modelo que a organização escolher — wrapper interno, DeepSeek, Claude, modelo local.
2. Nenhuma chave em texto claro no nosso banco.
3. Quem pode configurar credencial (e de quem) é decidido pela SPEC-28.

## 3. Custódia da credencial

### 3.1 A distinção que organiza o resto: segredo de infra ≠ segredo de usuário

Infisical e Vault, como o projeto já os usa (SPEC-12), resolvem **segredo de infraestrutura**: a aplicação busca as *próprias* credenciais na partida. Guardar a chave pessoal de cada usuário como "um segredo por pessoa" no vault é usar a ferramenta fora do que ela foi feita para fazer — vira gestão de milhares de paths, e no Vault a segregação forte (namespaces) é recurso **Enterprise**.

O padrão certo para segredo **de usuário** é outro: **envelope encryption**. O vault guarda a *chave de criptografia* (não-extraível) e expõe cifrar/decifrar; o **ciphertext** mora na nossa tabela, junto do resto do registro.

### 3.2 Decisão: Infisical KMS

O **Infisical KMS** faz exatamente isso: API de encrypt/decrypt, chaves **não extraíveis da plataforma**, dado **não armazenado** durante a operação, AES-GCM-256, e **CMEK** — a organização pode usar a própria chave no seu cloud KMS, de modo que nem o Infisical decifra sem ela.

Escolhido em vez do Vault Transit por um motivo prático e um de projeto: o Infisical **já está no repositório** (SPEC-12, `docker-compose` próprio, CLI no Dockerfile do server), e o CMEK responde à objeção que aparece em empresa — *"onde fica a chave que decifra a minha chave?"* — com "no seu cloud, não no deles".

**Ponto de atenção registrado**: isso adiciona uma dependência **em tempo de execução** ao caminho da esteira (decifrar antes de chamar o modelo). Mitigação: cache em memória por processo com TTL curto, nunca em disco; e falha de KMS é erro explícito ("não consegui abrir a credencial"), nunca queda silenciosa para outro provedor — rodar no modelo errado sem avisar é pior do que não rodar.

### 3.3 O que nunca acontece

- A chave **nunca** volta numa resposta HTTP. A UI vê `sk-…7890` — o `resumirCredencial` da SPEC-25 Fase 2 já é isso, e sobe para o server igual.
- A chave **nunca** entra em log, nem em mensagem de erro, nem em telemetria.
- A chave **nunca** vai para `config/` (regra da SPEC-25 §4.4, que no local já tem teste que falha se o caminho contiver `config`).

## 4. Modelo de dados

```
credenciais_ia (
  id, organizacaoId,
  escopoTipo,            -- organizacao | time | usuario
  escopoTimeId,          -- quando escopoTipo=time
  escopoEmail,           -- quando escopoTipo=usuario  ("meu Claude pessoal")
  tipoProvedor,          -- compativel-openai | anthropic | local
  rotulo,                -- "Wrapper corporativo", "Meu Claude"
  baseUrl, modelo, cabecalhosExtra,
  segredoCifrado,        -- ciphertext do KMS; jamais plaintext
  kmsKeyId,
  criadoPor, criadoEm, ultimoUsoEm
)
```

`escopoTipo = usuario` é o "Claude pessoal" do pedido: **só o dono** lê, edita ou usa — nem quem administra a organização enxerga a chave (vê que existe, para poder revogar).

## 5. Atribuição por agente

`pipeline-agentes.json` (SPEC-24 Fase F) ganha um campo por papel:

```json
{ "id": "po", "nome": "PO", "grupo": "po", "credencialId": "…", "ativo": true }
```

Sem `credencialId`, o papel usa o provedor padrão do projeto (`config/ia.json`) — comportamento de hoje, intacto.

**Resolução na hora de rodar**, em ordem: credencial do papel → se ela for de escopo `usuario` e o dono não for quem está rodando, **erro explícito** (não silencioso) → senão, padrão do projeto.

O caso "PO no meu Claude pessoal, Especialista no wrapper interno" cai naturalmente aqui, e a consequência precisa estar dita na tela: **o custo vai para a conta do dono da chave**. Um agente configurado com credencial pessoal roda — e é cobrado — na conta daquela pessoa. Isso não é detalhe de implementação; é a primeira pergunta que aparece depois que alguém liga.

## 6. Ligação com a SPEC-28

Recursos novos no enum de permissões:

| Recurso | Quem tipicamente | O que autoriza |
|---|---|---|
| `credenciais-ia` | Plataforma/Segurança | criar/editar credencial de **organização** ou de **time** |
| `credenciais-ia.propria` | qualquer pessoa | criar/editar a **sua** credencial pessoal |
| `pipeline-agentes` | o setor dono do fluxo | escolher **qual** credencial cada agente usa |

A separação entre as duas primeiras é o ponto: numa empresa, cadastrar o gateway corporativo é ato de plataforma, enquanto plugar o Claude pessoal é ato de quem paga por ele. Um recurso só não expressaria isso.

## 7. Fora de escopo, deliberado

- **OAuth com provedor de modelo** — §1: não existe, e na Anthropic é violação dos Termos. Se algum provedor lançar um fluxo legítimo, entra como implementação nova de credencial sem mexer no resto.
- **Rotação automática de chave** — o Infisical suporta; ligar depende de o provedor ter API de rotação. Registrado, não agendado.
- **Cobrança/quota por usuário dentro do produto** — mostrar consumo por agente/pessoa é feature própria. Aqui só se registra `ultimoUsoEm`.
- **Modo local** — segue com `~/.gerador/credenciais.json` (SPEC-25 Fase 2). Um usuário, uma máquina, sem KMS: o dono do arquivo é o dono da chave.

## 8. Roteiro faseado

1. **Fase 1 — custódia**: tabela `credenciais_ia` + adaptador de KMS (`cifrar`/`decifrar`) com **implementação em memória para teste** e Infisical em produção. CRUD que nunca devolve a chave. Sem UI.
2. **Fase 2 — por agente**: `credencialId` no papel + resolução (§5) + erro explícito nos casos impossíveis. É a SPEC-25 Fase 3 concluída de verdade.
3. **Fase 3 — UI**: aba "Modelo de IA" hospedada com credenciais por escopo, reusando o card da Fase 2 local; aviso de custo (§5) na atribuição de credencial pessoal.
4. **Fase 4 — permissões**: liga na SPEC-28 os três recursos do §6. Depende da SPEC-28 Fase 1.

## 9. Verificação

- **Nenhum caminho vaza a chave**: teste que percorre todas as respostas das rotas de credencial e falha se o plaintext aparecer em qualquer corpo — a mesma disciplina do teste que já existe no `packages/llm`.
- **Isolamento de escopo**: credencial `usuario` de A não é legível, editável nem utilizável por B, mesmo se B administra a organização.
- **Resolução por agente**: com PO apontando para credencial pessoal de A, rodar como A usa aquela credencial; rodar como B **falha com mensagem**, não cai calado no padrão.
- **KMS fora do ar**: erro explícito, sem fallback silencioso (§3.2).
- **Validação real**: contra o wrapper corporativo quando o token sair — o mesmo pendente registrado na SPEC-25 §8.4.

## 10. Fontes da pesquisa

- Anthropic — restrição de OAuth a Claude Code/claude.ai e a terceiros usarem API key: [claude-code#28091](https://github.com/anthropics/claude-code/issues/28091), [Claude Code — Authentication](https://code.claude.com/docs/en/authentication)
- OpenAI — ausência de OAuth que emita chave em nome do usuário: [OpenAI Developer Community](https://community.openai.com/t/proposal-for-oauth-authorization-in-third-party-applications-to-enhance-api-usage-and-security/559482), [Codex — Authentication](https://developers.openai.com/codex/auth)
- Infisical KMS (chaves não-extraíveis, AES-GCM, CMEK): [Infisical — KMS overview](https://infisical.com/docs/documentation/platform/kms/overview)
- Comparativo Infisical × HashiCorp Vault (namespaces multi-tenant no Enterprise): [Infisical vs HashiCorp Vault](https://infisical.com/compare/infisical-vs-hashicorp-vault)
