import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRegras } from "./client";

/**
 * §303 — o `timeId` que o cliente não mandava.
 *
 * O servidor SEMPRE modelou config por time (`obter` resolve time → global →
 * template, e `PUT /config/:chave` aceita `timeId` no corpo). O cliente web é
 * que lia e gravava `regras` sem dizer de quem era — então o documento de
 * regras, sozinho entre todas as configurações, era da organização inteira na
 * prática.
 *
 * O custo apareceu na suíte E2E: seis specs escrevendo no mesmo documento com
 * seis workers em paralelo, cada rodada um perdendo (§281, §299), três PRs
 * bloqueados. Mas o defeito não é de teste — é do produto: dois times não
 * conseguiam ter réguas diferentes, e nada na tela dizia isso.
 *
 * Estes testes existem porque a correção é INVISÍVEL. Ela não muda um pixel:
 * some um parâmetro de query e tudo continua funcionando, só que compartilhado
 * de novo. Sem uma asserção sobre a URL, a próxima refatoração desfaz isto sem
 * nenhum teste ficar vermelho.
 */
function fetchFalso() {
  const espiao = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ documento: { porTech: {} }, origem: "time" }),
  } as unknown as Response);
  vi.stubGlobal("fetch", espiao);
  return espiao;
}

const urlDe = (espiao: ReturnType<typeof fetchFalso>, chamada = 0) => String(espiao.mock.calls[chamada][0]);

afterEach(() => vi.unstubAllGlobals());

describe("config de regras por time", () => {
  it("ler com time ativo pergunta pelo documento DAQUELE time", async () => {
    const espiao = fetchFalso();
    await apiRegras.obterComDiagnostico("time-pagamentos");
    expect(urlDe(espiao)).toContain("/config/regras?timeId=time-pagamentos");
  });

  it("gravar com time ativo grava no documento DAQUELE time", async () => {
    const espiao = fetchFalso();
    await apiRegras.salvar({ porTech: {} } as never, "time-pagamentos");
    // O `timeId` vai no CORPO no PUT (e na query no GET) — é o contrato de
    // `routes/config.ts`, e trocar um pelo outro grava no global em silêncio.
    expect(JSON.parse(String(espiao.mock.calls[0][1]?.body))).toMatchObject({ timeId: "time-pagamentos" });
  });

  it("sem time ativo continua no global — quem não escolheu time não pode ficar sem regra", async () => {
    const espiao = fetchFalso();
    await apiRegras.obterComDiagnostico(undefined);
    expect(urlDe(espiao)).toContain("/config/regras");
    expect(urlDe(espiao)).not.toContain("timeId");
  });

  it("time com caractere de URL viaja escapado, e não corta a query ao meio", async () => {
    const espiao = fetchFalso();
    await apiRegras.obterComDiagnostico("time a&b");
    expect(urlDe(espiao)).toContain("timeId=time%20a%26b");
  });
});
