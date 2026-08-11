import { describe, expect, it } from "vitest";
import { resumirCredencialIa } from "./repositorioDeCredenciais.js";

/**
 * ACHADO REAL configurando voz no modo hospedado com gateway da Anthropic.
 *
 * `baseUrlTranscricao` existia no formulário (`ModeloIaTab`), no zod da rota
 * (`PUT /ia/credencial`) e na coluna do banco (`base_url_transcricao`) — e não
 * voltava neste resumo, que é o único jeito de a tela reler o que está salvo.
 *
 * O estrago não era só cosmético: a aba carregava o campo em branco mesmo com
 * valor gravado, e o "Salvar" seguinte mandava `undefined`, **apagando** a
 * configuração de voz sem ninguém ter pedido. Um campo que só some quando você
 * salva outra coisa é o tipo de defeito que ninguém reproduz de propósito.
 *
 * Mesma classe do #286, que perdeu o MESMO campo do outro lado da fronteira
 * (ao montar o provedor). Ali sumia na ida; aqui, na volta.
 */
describe("resumirCredencialIa — o que a tela consegue reler (#294)", () => {
  const completa = {
    baseUrl: "https://api.anthropic.com/v1",
    chave: "sk-ant-super-secreta",
    modelo: "claude-haiku-4-5-20251001",
    baseUrlTranscricao: "http://whisper:9000/v1",
    visao: true,
  };

  it("devolve o endereço de transcrição — sem isso o próximo salvar o apaga", () => {
    expect(resumirCredencialIa(completa)).toMatchObject({
      configurado: true,
      baseUrlTranscricao: "http://whisper:9000/v1",
    });
  });

  it("devolve também quando a credencial está incompleta — é o caso de quem está configurando AGORA", () => {
    // Sem `chave` ainda: a pessoa preencheu a voz e não terminou o resto. Se o
    // campo sumisse aqui, ela perderia o que digitou ao recarregar a aba.
    expect(resumirCredencialIa({ baseUrl: "https://gw/v1", baseUrlTranscricao: "http://whisper:9000/v1" })).toMatchObject({
      configurado: false,
      baseUrlTranscricao: "http://whisper:9000/v1",
    });
  });

  it("a chave continua MASCARADA — o resumo ganhou um endereço, não permissão de vazar segredo", () => {
    const resumo = resumirCredencialIa(completa);
    expect(resumo.chaveMascarada).toBe("sk-…reta");
    expect(JSON.stringify(resumo)).not.toContain("super-secreta");
  });

  it("credencial ausente não explode", () => {
    expect(resumirCredencialIa(null)).toMatchObject({ configurado: false });
    expect(resumirCredencialIa(undefined)).toMatchObject({ configurado: false });
  });
});
