/** Dispara o download de um arquivo de texto no browser — usado por autosave-fallback e exports. */
export function baixarArquivoTexto(conteudo: string, nome: string, mime: string): void {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
