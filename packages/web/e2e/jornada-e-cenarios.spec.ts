import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

// Este arquivo testa fluxos determinísticos SEM IA (cenários, tour) — mas a
// credencial do gateway é da organização e outros specs a criam em paralelo
// (§162), o que ligava a esteira (e o M1 da SPEC-37) conforme a corrida. O
// route declara o pressuposto: sem gateway. O M1 é coberto em ia-hospedada.
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("jornada abre sozinha no primeiro acesso, explica as saídas, e some ao fechar", async ({ page }) => {
  await entrar(page);

  await expect(page.getByText("Como funciona o Gerador de Itens")).toBeVisible();
  await expect(page.getByText("Não é um gerador de prompt de IA")).toBeVisible();
  // `.first()`: "Especificação de solução" aparece duas vezes na jornada (o
  // título da saída e a menção no corpo). O que este teste garante é que a
  // saída está listada, não quantas vezes o nome aparece.
  await expect(page.getByText("Especificação de solução").first()).toBeVisible();

  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();

  await page.reload();
  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();
});

test("carregar um cenário pronto popula a mesa de projeto e deriva sem ciclos/conflitos", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "produtos" })).toBeVisible();

  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  // Cenário carregado não tem título → o assistente pergunta o nome antes.
  // Aqui é exploração, não registro: "Derivar sem salvar" segue direto.
  await expect(page.getByTestId("assistente-balao")).toContainText("qual é o nome da demanda");
  await page.getByTestId("assistente-balao-secundaria").click();

  await expect(page.getByTestId("contagem-itens")).toHaveText("4 itens");
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenario-mongo.png", fullPage: true });
});

test("tela Stacks conhecidas (SPEC-43): cards por COMPONENTE, sem nenhuma menção a time", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Stacks conhecidas/ }).click();

  // Escopado pra dentro da tela de config: o header tem um <select> com essas
  // mesmas strings como <option>, e getByText também bate em <option>s no DOM.
  const telaConfig = page.locator('[data-tour="config-screen-content"]');
  // SPEC-43: a migração 0026 fatiou o perfil misto por componente — o card
  // "Java + Spring Boot" é do Serviço e "Camunda 7" é do Processo, e nenhum
  // deles menciona time (o catálogo é global).
  await expect(telaConfig.getByTestId("stack-Java + Spring Boot")).toBeVisible();
  await expect(telaConfig.getByTestId("stack-Camunda 7")).toBeVisible();
  await expect(telaConfig.getByTestId("stack-Java + Spring Boot").getByText("Spring Boot", { exact: true })).toBeVisible();
  await expect(telaConfig.getByText(/usado por/)).toHaveCount(0);
  await expect(telaConfig.getByText(/salvar estes valores como stack conhecida/)).toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/perfis-de-time-tab.png", fullPage: true });
});

test("declarar uma stack conhecida faz um Serviço novo de QUALQUER time já sugerir o valor (SPEC-43)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // time-checkout de propósito: o catálogo é GLOBAL — a sugestão chega sem o
  // time declarar nada (era o ponto do "poderia simplesmente ter tudo").
  await entrar(page, "time-checkout");

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Stacks conhecidas/ }).click();

  const nomeStack = `stack e2e ${Date.now()}`;
  await page.getByLabel("Componente da nova stack").selectOption({ label: "Serviço" });
  await page.getByLabel("Nome da nova stack").fill(nomeStack);
  await page.getByRole("button", { name: "+ Criar stack" }).click();

  const cardStack = page.getByTestId(`stack-${nomeStack}`);
  await expect(cardStack).toBeVisible();
  await cardStack.getByText("+ adicionar valor").click();
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Linguagem/Stack" });
  await page.getByLabel("Valor", { exact: true }).fill("Java");
  await page.getByTestId("salvar-valor-de-stack").click();

  // Grava direto no servidor — o valor aparece no card da stack.
  await expect(cardStack.getByText("linguagem:", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // Login como time-checkout já deixou esse time ativo no header (select, não
  // mais texto livre) — um Serviço novo já nasce sugerindo o valor recém-declarado.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.locator(".react-flow__node", { hasText: "Serviço" }).click();

  await expect(page.getByText("usar sugestão: Java").first()).toBeVisible();
});

test("adicionar dois cenários à mesa de projeto (sem substituir) compõe um diagrama maior, sem colidir IDs, e deriva tudo junto", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();

  await page.getByRole("button", { name: "Adicionar cenário à mesa de projeto: Dados não-relacionais" }).click();
  await expect(page.getByText("✓ Adicionado")).toBeVisible();
  // Não fecha o modal — dá pra adicionar outro em seguida.
  await expect(page.getByText("Como funciona o Gerador de Itens")).toBeVisible();

  await page.getByRole("button", { name: "Adicionar cenário à mesa de projeto: Streaming Kafka" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();

  // 4 nós do mongo (2) + kafka (3) = 5, mas mongo e kafka cada um tem um "Serviço"
  // com nome próprio — confere pelos rótulos, que são únicos entre os dois cenários.
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "produtos" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-portabilidade" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "portabilidade.solicitada.v1" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-auditoria-eventos" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  // Sem título → pergunta do nome; composição de cenários é exploração.
  await expect(page.getByTestId("assistente-balao")).toContainText("qual é o nome da demanda");
  await page.getByTestId("assistente-balao-secundaria").click();

  // 4 atividades do mongo + 5 do kafka = 9 — se algum ID tivesse colidido/se
  // perdido na mesclagem, esse número não bateria.
  await expect(page.getByTestId("contagem-itens")).toHaveText("9 itens");
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenarios-compostos.png", fullPage: true });
});

/**
 * SPEC-48 — o tour validado pelo TÍTULO de cada passo, não pelo número: o
 * spec antigo dizia "PASSO 7 DE 13" e quebrava toda vez que o produto
 * ganhava um passo novo (que é o que se quer que aconteça). O que importa é
 * que a etapa existe, na ordem, e que a tela certa abre com ela.
 */
/**
 * §252 — o tour anda SOZINHO agora, e um teste que clica "Próximo" enquanto o
 * relógio corre andaria dois passos por clique. Pausar é o que dá ao teste o
 * mesmo controle que uma pessoa tem — e é um botão de verdade, não um gancho
 * criado para o teste.
 */
async function pausarTour(page: import("@playwright/test").Page) {
  await page.getByTestId("tour-pausar").click();
  await expect(page.getByTestId("tour-pausar")).toHaveText("▶");
  // Sair de cima da carta: o hover segura o relógio, e um teste que anda
  // clicando não deve depender de onde o ponteiro parou.
  await page.mouse.move(0, 0);
}

async function irAtePasso(page: import("@playwright/test").Page, titulo: string) {
  for (let i = 0; i < 25; i++) {
    if (await page.getByTestId("tour-titulo").filter({ hasText: titulo }).count()) return;
    await page.getByRole("button", { name: "Próximo" }).click();
  }
  throw new Error(`passo "${titulo}" não apareceu no tour`);
}

test("tour guiado de 1 clique percorre o ciclo inteiro: desenho, derivação, confirmação em lote, itens escritos, documento e configurações", async ({
  page,
}) => {
  test.setTimeout(60000);
  await entrar(page);

  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();
  await pausarTour(page);

  // Abertura, sem alvo (overlay centralizado).
  await expect(page.getByTestId("tour-titulo")).toHaveText("Bem-vindo");
  await expect(page.getByText(/PASSO 1 DE \d+/)).toBeVisible();

  // §235 — a porta de entrada real: o desenho nasce da conversa, e o tour
  // antes começava com ele já pronto.
  await irAtePasso(page, "Começar conversando");
  await expect(page.getByTestId("assistente-janela")).toBeVisible();
  await expect(page.getByText(/serviço de catálogo de produtos/i)).toBeVisible();

  // O diagrama de verdade, com o cenário do tour já carregado.
  await irAtePasso(page, "O diagrama");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Prontidão e proveniência.
  await irAtePasso(page, "Prontidão");
  await expect(page.locator('[data-tour="readiness-summary"]')).toBeVisible();
  // SPEC-57 — o passo do PROPÓSITO, entre a prontidão e a proveniência: é a
  // mesma barra, uma dimensão a mais. O cenário do tour traz três
  // necessidades, uma delas sem componente — a lacuna é o que instrui.
  await irAtePasso(page, "Para que serve cada componente");
  await expect(page.getByTestId("proposito-resumo")).toContainText("1 sem componente");
  await expect(page.getByTestId("assistente-janela")).toBeVisible();
  await expect(page.getByText("produto fora de linha some do catálogo em até 24h")).toBeVisible();

  // §238 — a proposta MEDIDA antes de aceitar: a interação que a fatia D
  // construiu e o tour não mostrava. O cenário traz uma necessidade sugerida e
  // não confirmada, então o delta existe na tela.
  await irAtePasso(page, "O agente propõe, o motor mede");
  const delta = page.getByTestId("delta-da-proposta");
  await expect(delta).toBeVisible();
  await expect(delta).toContainText("1 sugerida(s), ainda sem efeito");
  await expect(delta).toContainText("aceitar propósito sem componente cria trabalho");
  // E o placar NÃO conta a sugerida: só as três confirmadas, uma delas em lacuna.
  await expect(page.getByTestId("proposito-resumo")).toContainText("1 sem componente");

  // §245 — a conformidade na demonstração: sem regra de demonstração o ⚖ não
  // apareceria, porque ele depende de `regras` com `checagem` e a config de
  // quem está vendo raramente tem uma (§244).
  await irAtePasso(page, "O padrão do time, conferido");
  const chipPadrao = page.getByTestId("conformidade-resumo");
  await expect(chipPadrao).toContainText("1 fora do padrão");
  await chipPadrao.click();
  const listaPadrao = page.getByTestId("conformidade-lista");
  await expect(listaPadrao).toContainText("chave de sharding");
  // O porquê é o que separa ensinar de cobrar.
  await expect(listaPadrao).toContainText("migração de madrugada");
  await chipPadrao.click();

  // §248 — a fatia E: o motor LEU o caminho do cenário (srv-catalogo →
  // produtos) e pede confirmação. Nada inventado: o caminho emerge do desenho
  // que o tour já carregava.
  await irAtePasso(page, "O caminho, não só os componentes");
  const chipPercurso = page.getByTestId("percursos-resumo");
  await expect(chipPercurso).toContainText("a confirmar");
  await chipPercurso.click();
  const listaPercurso = page.getByTestId("percursos-lista");
  await expect(listaPercurso).toContainText("srv-catalogo → produtos");
  // A regra 2 dita na tela, não só no código.
  await expect(listaPercurso).toContainText("Nada é medido antes de você confirmar");
  await chipPercurso.click();

  // §246 — a fatia C na demonstração: o 🧭 com uma decisão aceita (com a
  // descartada) e uma proposta do agente esperando alguém.
  await irAtePasso(page, "Por que este desenho é assim");
  const chipDecisao = page.getByTestId("decisoes-resumo");
  await expect(chipDecisao).toContainText("1 a decidir");
  await chipDecisao.click();
  const listaDecisao = page.getByTestId("decisoes-lista");
  await expect(listaDecisao).toContainText("Mongo em vez de Postgres");
  // O porquê, que é a fatia inteira.
  await expect(listaDecisao).toContainText("opere o índice GIN");
  await chipDecisao.click();

  // §251 — o ATO de pedir a decisão ao agente, não só o resultado dela.
  await irAtePasso(page, "Peça ao agente");
  await expect(page.getByTestId("pedir-decisao-ao-agente")).toBeVisible();
  // O painel mostra a proposta pendente do agente junto do botão: é o "antes e
  // depois" na mesma tela.
  await expect(page.locator("aside").getByTestId("decisao-proposta")).toBeVisible();

  await irAtePasso(page, "Proveniência");
  // A janela flutuante FECHA: sem isso ela cobre o painel que o passo mostra.
  await expect(page.getByTestId("assistente-janela")).toHaveCount(0);
  await expect(page.locator('[data-tour="properties-panel"]')).toBeVisible();

  // Derivação de verdade — a revisão abre com os itens calculados.
  await irAtePasso(page, "Revisão");
  await expect(page.locator('[data-tour="review-table"]')).toBeVisible();
  await expect(page.getByTestId("contagem-itens")).toHaveText("4 itens");

  // SPEC-44/48 — a confirmação em lote entrou no tour.
  await irAtePasso(page, "Confirmar o que a IA escreveu");
  await expect(page.getByTestId("barra-pendencias")).toBeVisible();

  // O documento sai pelo agente (o botão do header morreu na SPEC-39).
  await irAtePasso(page, "Especificação de solução");
  await expect(page.getByRole("button", { name: "Gerar especificação de solução" })).toHaveCount(0);
  await expect(page.getByTestId("abrir-conversa-especificacao")).toBeVisible();

  // §251 — a TELA do documento (SPEC-58), a lacuna que a avaliação encontrou.
  //
  // §234 aplicado de novo: cobrar CONTEÚDO. "Tela visível" passaria com o
  // documento vazio, que é exatamente o que não pode acontecer aqui.
  await irAtePasso(page, "O documento de desenho");
  const documento = page.getByTestId("documento-screen");
  await expect(documento).toBeVisible();
  await expect(page.getByTestId("faixa-de-saude")).toBeVisible();
  await expect(page.getByTestId("documento-diagrama")).toBeVisible();
  // §254 — o diagrama ESCAPA da coluna de leitura. Espremido em ~46rem, o
  // gerador da SPEC-21 empilha o cabeçalho e corta o botão de reproduzir
  // (print do usuário). Medir é o único jeito de saber: `width: min(...)`
  // continuaria escrito no código com o quadro estreito.
  const larguraDesenho = (await page.getByTestId("documento-diagrama").boundingBox())?.width ?? 0;
  const larguraTexto = (await page.getByRole("heading", { level: 1 }).boundingBox())?.width ?? 0;
  expect(larguraDesenho).toBeGreaterThan(larguraTexto);
  // As decisões da demonstração chegam ao documento, com o descartado.
  await expect(documento.getByTestId("documento-decisao").first()).toContainText("Mongo em vez de Postgres");
  // E as duas seções que só uma pessoa escreve.
  await expect(page.getByTestId("secao-tradeoffs")).toBeVisible();
  await expect(page.getByTestId("secao-riscos")).toBeVisible();
  await expect(page.getByTestId("status-documento")).toBeVisible();

  // SPEC-47/48 — os ITENS ESCRITOS, a tela que o tour não conhecia.
  //
  // §234 — cobrar CONTEÚDO, não só a tela: o passo abria a tela vazia
  // ("ainda não existe nenhum item") enquanto o texto prometia os cards, e a
  // asserção de visibilidade passava assim mesmo. Tela visível não é a mesma
  // coisa que tela útil.
  await irAtePasso(page, "Itens escritos");
  await expect(page.getByTestId("itens-screen")).toBeVisible();
  await expect(page.getByTestId("itens-vazio")).toHaveCount(0);
  await expect(page.getByTestId("itens-resumo")).toBeVisible();

  // §234 — e o passo do MENU precisa estar numa tela que TEM menu: sair dos
  // itens caía de volta na revisão (o resultado seguia setado, cobrindo o
  // canvas), e o ☰ não existe lá.
  await irAtePasso(page, "O menu");
  await expect(page.locator('[data-tour="menu-botao"]')).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // §252 — as telas de administração saíram deste tour. Ele voltou a
  // responder "isto serve pra quê?", que é o que a divisão do §236 queria e a
  // deriva de sete passos tinha desfeito. Elas são cobradas no tour de
  // configuração, abaixo.

  await irAtePasso(page, "Fim do tour");
  await expect(page.locator('[data-tour="config-screen-content"]')).not.toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await expect(page.getByText(/PASSO \d+ DE \d+/)).not.toBeVisible();
  await expect(page.getByTestId("contagem-itens")).not.toBeVisible();
});

/**
 * §252 — o tour ANDA SOZINHO. Sem este teste, o modo automático seria uma
 * afirmação de teste de unidade: o relógio existe no hook, e o que ninguém
 * saberia é se ele chega à tela.
 */
test("o tour avança sozinho, e o botão de pausa segura de verdade", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-como-funciona").click();
  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();
  // TIRAR O PONTEIRO DA CARTA antes de esperar. O ponteiro fica onde o último
  // clique o deixou, e a carta do tour é posicionada por cima — se ela nascer
  // debaixo dele, o hover SEGURA o relógio e o tour não anda. Não é
  // preciosismo de teste: é o mesmo motivo pelo qual uma pessoa que deixou o
  // mouse parado na tela veria o tour "travado".
  await page.mouse.move(0, 0);
  const titulo = page.getByTestId("tour-titulo");
  await expect(titulo).toHaveText("Bem-vindo");

  // §254 — o ponteiro do tour aparece assim que há um alvo para apontar.
  // (O primeiro passo é de tela cheia, sem alvo: por isso não se cobra aqui.)

  // Ninguém clica em nada: o primeiro passo pede 6s.
  await expect(titulo).not.toHaveText("Bem-vindo", { timeout: 20000 });
  const segundoPasso = await titulo.innerText();
  // O segundo passo tem alvo — e o ponteiro vai até ele.
  await expect(page.getByTestId("cursor-fantasma")).toBeVisible();

  // Pausar segura — e o mouse indo até o botão NÃO pode desfazer a pausa, que
  // foi o defeito que os dois estados (pausado × segurado) resolveram.
  await page.getByTestId("tour-pausar").click();
  await expect(page.getByTestId("tour-pausar")).toHaveText("▶");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(14000);
  await expect(titulo).toHaveText(segundoPasso);

  // E retomar volta a andar.
  await page.getByTestId("tour-pausar").click();
  await page.mouse.move(5, 5);
  await expect(titulo).not.toHaveText(segundoPasso, { timeout: 20000 });
});

test("pular tour a qualquer momento encerra o overlay imediatamente", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-como-funciona").click();
  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Pular tour" }).click();

  // Sem contagem fixa: passo novo entra a cada rodada, e um "DE 13" cravado
  // faria este teste quebrar por motivo nenhum (§233).
  await expect(page.getByText(/PASSO \d+ DE \d+/)).not.toBeVisible();
});

/**
 * §236 — o SEGUNDO tour: o que se molda pro time.
 *
 * Separado do primeiro de propósito: aquele responde "isto serve pra quê?" e
 * este "como eu adapto pro meu time". Juntos seriam 25 passos, e a parte que
 * decide se alguém adota a ferramenta ficaria no meio de tela de administração.
 */
test("tour de configuração percorre as quatro telas que o tour do produto não alcança", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-como-funciona").click();
  await page.getByTestId("tour-configuracao").click();
  await pausarTour(page);

  await expect(page.getByTestId("tour-titulo")).toHaveText("Moldar pro seu time");

  const telaConfig = page.locator('[data-tour="config-screen-content"]');

  // §252 — as sete telas de administração migraram do tour do produto para cá.
  // O de produto voltou a responder "serve pra quê" em 19 passos; este passou
  // a ser o lugar de "como eu adapto", com 13.
  // §252 — a ordem AQUI tem que ser a ordem do tour: `irAtePasso` só anda
  // para a frente, e pedir um passo já passado leva o laço até o fim, onde
  // não existe mais "Próximo". Foi o que aconteceu na migração.
  //
  // §235 — o contexto do PRODUTO vem com dado de demonstração E a marca que
  // diz que é de demonstração: sem ela, alguém sai do tour achando que
  // configurou um produto.
  await irAtePasso(page, "Contexto do produto");
  await expect(page.getByTestId("marca-demonstracao")).toBeVisible();
  await expect(page.getByText("Catálogo (exemplo)")).toBeVisible();

  await irAtePasso(page, "Stacks conhecidas");
  await expect(telaConfig.getByText("Stacks conhecidas").first()).toBeVisible();

  await irAtePasso(page, "Padrões por componente");
  await expect(telaConfig.getByRole("button", { name: "sobrescrever" }).first()).toBeVisible();

  await irAtePasso(page, "Campos por tipo de conexão");
  await expect(telaConfig).toBeVisible();

  await irAtePasso(page, "Regras de refinamento");
  await expect(telaConfig).toBeVisible();

  await irAtePasso(page, "Modelos: documento e item");
  await expect(telaConfig.getByText(/\{\{titulo\}\}/).first()).toBeVisible();

  await irAtePasso(page, "Modelo de IA");
  // Sem credencial configurada — o estado de quem acabou de instalar, que é
  // exatamente quem faz o tour. §236: aqui a tela dizia para rodar
  // `gerador ia instalar`, comando que a SPEC-33 apagou junto com a CLI.
  await expect(page.getByTestId("ia-sem-gateway")).toBeVisible();
  await expect(page.getByText(/gerador ia instalar/)).toHaveCount(0);

  await irAtePasso(page, "Esteira de agentes");
  await expect(telaConfig).toBeVisible();

  await irAtePasso(page, "Níveis e acessos");
  await expect(telaConfig.getByText(/visualizar.*lê as quebras/).first()).toBeVisible();

  await irAtePasso(page, "Do item à issue");
  await expect(page.getByTestId("config-exportacao")).toBeVisible();
  await expect(page.getByTestId("marca-demonstracao")).toBeVisible();

  await irAtePasso(page, "Melhoria contínua (PDCA)");
  await expect(telaConfig.getByTestId("feedbacks-do-ciclo")).toBeVisible();

  // E o passo da DERIVAÇÃO não aparece aqui: são duas listas, não a mesma com
  // filtro — se um passo do produto vazasse, quem só quer configurar levaria a
  // ferramenta inteira junto.
  await irAtePasso(page, "Fim");
  await expect(page.getByTestId("tour-titulo")).toHaveText("Fim");
});
