# SPEC-54 — A credencial de IA sai do banco e vai para o cofre

## 1. O problema

A chave do gateway de IA está numa coluna `chave` da tabela `credenciais_ia`,
em texto plano. Todo backup do Postgres do app carrega a chave junto; quem tem
acesso de leitura ao banco tem a chave; e a rotação depende de alguém abrir a
tela e colar outra.

O usuário já roda **Infisical self-hosted** (SPEC-12) na mesma máquina. A
observação dele foi direta: com um cofre rodando, guardar segredo no banco do
app não se sustenta.

## 2. Por que a SPEC-12 não resolve isto sozinha

A SPEC-12 decidiu, com razão, **não** colocar SDK de vault dentro do servidor:
os segredos que ela trata (`OIDC_CLIENT_SECRET`, `SESSAO_SEGREDO`) são de
**boot**, e `infisical run` os injeta como variáveis de ambiente antes do
processo subir. Zero acoplamento, vault trocável.

A credencial de IA não é um segredo de boot. Ela **nasce em runtime**: alguém
abre "Modelo de IA", cola a chave, testa a conexão e salva — e passa a valer
sem reiniciar nada. `infisical run` não escreve, e injeção no boot não muda
depois. Não é o mesmo problema, e por isso não pode ser a mesma solução.

## 3. A decisão

**O que é segredo vai para o cofre; o que é configuração continua no banco.**

| Vai para o cofre | Continua no banco |
|---|---|
| `chave` (a única coisa que é segredo) | `baseUrl`, `modelo`, `cabecalhos`, `formatoJson`, `baseUrlTranscricao`, `visao` |

Endereço de gateway e nome de modelo não são segredo — são configuração da
organização, que a tela precisa ler para se desenhar. Mandá-los para o vault
faria a tela depender do cofre para mostrar um formulário.

### 3.1 Uma porta, dois adaptadores, um decorator

`RepositorioDeCredenciais` **não muda** — quem chama continua sem saber de onde
vem a chave. Entram:

- `CofreDeSegredos`: porta mínima (`ler`, `gravar`, `apagar` por nome).
- `criarCofreInfisical`: adaptador HTTP (Universal Auth + Secrets v3).
- `comCofreDeSegredos(repoDoBanco, cofre)`: decorator que grava a chave no
  cofre e o resto no banco.

Trocar o Infisical por outro cofre é implementar uma interface de três métodos.

### 3.2 Sem cofre configurado, nada muda

Sem `INFISICAL_*` no ambiente, o servidor usa o repositório do banco como
sempre. Dev, E2E e quem ainda não tem vault continuam funcionando **sem
nenhuma mudança** — e o servidor diz no log qual caminho está ativo, porque
"minha chave sumiu" e "o cofre não subiu" são a mesma tela para quem usa.

### 3.3 A chave que já está no banco migra sozinha

Quem já configurou tem a chave no Postgres. Na primeira leitura com o cofre
ativo, se o cofre não tem a chave e o banco tem, ela é **movida**: gravada no
cofre e apagada da coluna. Sem passo manual, sem tela de migração, e sem
janela em que a chave existe nos dois lugares por mais de uma operação.

### 3.4 O custo, dito por escrito

A identidade do Infisical passa a precisar de permissão de **escrita** no
projeto/ambiente — hoje a SPEC-12 pede só leitura. É um aumento real de blast
radius: vazar o `INFISICAL_CLIENT_SECRET` deixava ler segredos daquele escopo,
e passa a deixar sobrescrevê-los.

A alternativa seria a credencial de IA virar segredo de boot (injetada por
`infisical run`), o que elimina a escrita — e elimina junto a configuração pela
tela, que é como o produto funciona hoje. Entre perder a funcionalidade e
ampliar o escopo de uma identidade que já existe e é revogável pela UI, a
escolha é ampliar o escopo. Fica registrada como escolha, não como descuido.

## 4. Falha do cofre é falha explícita

Cofre fora do ar não vira "credencial não configurada" — isso mandaria a tela
dizer "configure sua chave" para quem tem a chave configurada, e o próximo
"Salvar" gravaria por cima. Erro de cofre sobe como erro, com o motivo.
