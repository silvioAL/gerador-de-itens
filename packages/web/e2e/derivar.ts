import { expect, type Page } from "@playwright/test";

/**
 * §261 — derivar passou a ter DOIS passos quando há o que reconhecer.
 *
 * O diálogo lista o que a derivação não resolve (necessidade sem dono, caminho
 * sem medir, decisão pendente) e segue com um clique. Ele aparece por mérito:
 * o cenário `mongo.json`, usado por metade da suíte, tem uma necessidade órfã
 * de verdade.
 *
 * O helper não esconde o diálogo — ele o ATRAVESSA, e só quando existe. Um
 * teste que quiser cobrar o reconhecimento continua fazendo isso na mão (é o
 * caso do tour, e do spec do próprio diálogo).
 */
export async function derivarNaMesa(page: Page) {
  await page.locator('[data-tour="derivar-button"]').click();
  await reconhecerAvisos(page);
}

/**
 * Atravessa o reconhecimento **se** ele existir.
 *
 * O "se" é o ponto: se o diálogo aparecesse sempre, um clique cravado
 * bastaria. Ele aparece por mérito — o cenário `mongo.json` traz uma
 * necessidade órfã, e compor cenários pela mesa NÃO traz (só o diagrama é
 * mesclado). Cravar o clique fazia justamente esse segundo caso quebrar.
 */
export async function reconhecerAvisos(page: Page) {
  const avisos = page.getByTestId("avisos-da-derivacao");
  // `waitFor` e não `isVisible()`: o segundo responde no mesmo instante, e
  // logo depois do clique o React ainda não montou o diálogo — dava `false`,
  // o helper seguia, e o diálogo abria em cima do resto do teste. Num arquivo
  // serial isso derruba os testes SEGUINTES, que é o pior tipo de falha
  // (aparece longe da causa).
  const apareceu = await avisos
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!apareceu) return;
  await page.getByTestId("derivar-mesmo-assim").click();
  await expect(avisos).toHaveCount(0);
}
