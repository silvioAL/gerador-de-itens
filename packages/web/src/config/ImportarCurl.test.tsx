import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImportarCurl } from "./ImportarCurl";

/**
 * SPEC-118 fatias A e B, do lado da tela.
 *
 * O que estes testes guardam é a §3.1 — a régua mais importante da SPEC, *"e a
 * única cujo erro é irreversível: chave vazada não se desvaza"*.
 */
function montar() {
  const onImportar = vi.fn();
  render(<ImportarCurl onImportar={onImportar} oQuePreenche="os campos deste destino" />);
  const campo = screen.getByLabelText("Cole o curl que já funciona");
  const botao = screen.getByTestId("importar-curl-botao");
  return { onImportar, campo, botao };
}

const CURL = `curl --location 'https://gw.empresa/jira/issues' \\
--header 'Authorization: Bearer sk-abc123456789' \\
--header 'X-Team: pagamentos' \\
--data '{"itens": [{"chave": "n1"}]}'`;

describe("colar um curl (SPEC-118 fatias A e B)", () => {
  it("entrega ao formulário o endereço, o verbo, os cabeçalhos e o corpo", () => {
    const { onImportar, campo, botao } = montar();

    fireEvent.change(campo, { target: { value: CURL } });
    fireEvent.click(botao);

    expect(onImportar).toHaveBeenCalledWith({
      url: "https://gw.empresa/jira/issues",
      metodo: "POST",
      // A chave JÁ saiu daqui — quem recebe nunca vê o `Authorization`.
      cabecalhos: { "X-Team": "pagamentos" },
      corpo: '{"itens": [{"chave": "n1"}]}',
      chave: "Bearer sk-abc123456789",
      cabecalhoDaChave: "Authorization",
    });
  });

  it("regra 1 da §3.1 — o campo se ESVAZIA ao interpretar", () => {
    /**
     * É a única linha do componente cuja ausência é irreversível: um curl que
     * sobra na tela sobra também no screenshot de suporte, no undo buffer e no
     * relatório de erro.
     */
    const { campo, botao } = montar();

    fireEvent.change(campo, { target: { value: CURL } });
    fireEvent.click(botao);

    expect(campo).toHaveValue("");
  });

  it("regra 3 da §3.1 — a tela DIZ que reconheceu um segredo, mascarado", () => {
    /**
     * Silêncio aqui faria a pessoa achar que a chave foi para a config
     * versionável — e é exatamente a dúvida que ela precisa não ter.
     */
    const { campo, botao } = montar();

    fireEvent.change(campo, { target: { value: CURL } });
    fireEvent.click(botao);

    const aviso = screen.getByTestId("importar-curl-segredo");
    expect(aviso).toHaveTextContent("Reconheci uma chave");
    expect(aviso).toHaveTextContent("não para a configuração");
    // Mascarada: o suficiente para reconhecer QUAL é, nunca para usá-la.
    expect(aviso.textContent).toContain("Bearer");
    expect(aviso.textContent).not.toContain("sk-abc123456789");
  });

  it("curl SEM autenticação não anuncia segredo nenhum", () => {
    const { campo, botao } = montar();

    fireEvent.change(campo, { target: { value: `curl 'https://gw/x'` } });
    fireEvent.click(botao);

    expect(screen.getByTestId("importar-curl-resumo")).toBeInTheDocument();
    expect(screen.queryByTestId("importar-curl-segredo")).toBeNull();
  });

  it("o que ele entendeu aparece ANTES de salvar — é o que a pessoa confere", () => {
    // §4: "esconder os campos depois de importar" é recusado; o resumo existe
    // para a conferência, e o formulário continua lá.
    const { campo, botao } = montar();

    fireEvent.change(campo, { target: { value: CURL } });
    fireEvent.click(botao);

    expect(screen.getByTestId("importar-curl-resumo")).toHaveTextContent("POST https://gw.empresa/jira/issues");
  });

  it("recusa NOMEADA, e o formulário não é tocado", () => {
    /**
     * §3.3 — parse parcial silencioso preencheria metade do formulário e
     * deixaria a outra metade com o valor antigo. Ninguém descobriria até a
     * chamada falhar em produção.
     */
    const { onImportar, campo, botao } = montar();

    fireEvent.change(campo, { target: { value: "Invoke-WebRequest -Uri https://gw/x" } });
    fireEvent.click(botao);

    expect(onImportar).not.toHaveBeenCalled();
    expect(screen.getByTestId("importar-curl-erro")).toHaveTextContent("não reconheci este formato");
    // E o texto FICA, porque é o que a pessoa vai corrigir.
    expect(campo).toHaveValue("Invoke-WebRequest -Uri https://gw/x");
  });

  it("campo vazio não chama nada — não há o que interpretar", () => {
    const { onImportar, botao } = montar();

    expect(botao).toBeDisabled();
    expect(onImportar).not.toHaveBeenCalled();
  });
});
