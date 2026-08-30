import { useRef, useState } from "react";

/**
 * SPEC-30 Fase 2 — anexar um print à conversa do desenho.
 *
 * O uso concreto: print de um diagrama que já existe (Miro, Confluence, lousa,
 * foto de rascunho) → o agente propõe os nós e conexões equivalentes, usando
 * **os tipos que existem na config** (os trilhos da SPEC-27). A imagem é
 * insumo, não formato novo de saída: nada em `useQuebra`, `derivar` ou na
 * esteira muda por causa dela.
 *
 * Só aparece quando o provedor selecionado enxerga imagem — mesma regra do
 * microfone. E o aviso de saída de dados é fixo, não some depois do primeiro
 * uso: print de arquitetura costuma ter mais informação sensível do que quem
 * anexa lembra na hora.
 */
export interface ImagemAnexada {
  /** `data:image/png;base64,...` — é o que o gateway aceita direto. */
  dataUrl: string;
  nome: string;
  bytes: number;
}

export interface AnexoDeImagemProps {
  imagens: ImagemAnexada[];
  onMudar: (imagens: ImagemAnexada[]) => void;
  /** Para onde a imagem vai — o endereço configurado. Mostrado no aviso, porque
   * "sai da máquina" significa coisas muito diferentes se o destino é o
   * container ao lado ou um provedor público. */
  destino?: string;
  desabilitado?: boolean;
}

/**
 * Teto por imagem. Data URL infla ~33% no base64, e a imagem vai inteira no
 * corpo do pedido — sem teto, um print de monitor 4K vira megabytes de JSON.
 * A lição de sempre: *toda ausência de teto virou bug*.
 */
const LIMITE_BYTES = 4 * 1024 * 1024;
const MAXIMO_IMAGENS = 3;

export function AnexoDeImagem({ imagens, onMudar, destino, desabilitado }: AnexoDeImagemProps) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    const novas: ImagemAnexada[] = [];

    for (const arquivo of Array.from(arquivos)) {
      if (imagens.length + novas.length >= MAXIMO_IMAGENS) {
        setErro(`Máximo de ${MAXIMO_IMAGENS} imagens por conversa.`);
        break;
      }
      if (arquivo.size > LIMITE_BYTES) {
        setErro(`"${arquivo.name}" tem mais de ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB — reduza antes de anexar.`);
        continue;
      }
      novas.push({ dataUrl: await comoDataUrl(arquivo), nome: arquivo.name, bytes: arquivo.size });
    }

    if (novas.length) onMudar([...imagens, ...novas]);
    // Zera o input: sem isso, escolher o MESMO arquivo de novo não dispara
    // `change` e a pessoa acha que o clique não funcionou.
    if (entradaRef.current) entradaRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => entradaRef.current?.click()}
          disabled={desabilitado || imagens.length >= MAXIMO_IMAGENS}
          style={botaoEstilo}
          data-testid="anexar-imagem"
        >
          🖼 Anexar imagem
        </button>
        <input
          ref={entradaRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => void aoEscolher(e.target.files)}
          style={{ display: "none" }}
          aria-label="Escolher imagem"
        />

        {imagens.map((img, i) => (
          <span key={i} style={chipEstilo} data-testid={`imagem-anexada-${i}`}>
            <img src={img.dataUrl} alt="" style={{ width: 20, height: 20, objectFit: "cover", borderRadius: 3 }} />
            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {img.nome}
            </span>
            <button
              onClick={() => onMudar(imagens.filter((_, j) => j !== i))}
              style={removerEstilo}
              aria-label={`Remover ${img.nome}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {imagens.length > 0 && (
        <p style={avisoEstilo} data-testid="aviso-saida-de-dados">
          A imagem é enviada para <strong>{destino ?? "o endereço configurado"}</strong>. Se for um gateway interno,
          continua dentro da empresa; se for um provedor público, é upload para terceiro.
        </p>
      )}
      {erro && (
        <p style={{ ...avisoEstilo, color: "var(--vermelho)" }} data-testid="erro-anexo">
          {erro}
        </p>
      )}
    </div>
  );
}

function comoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error("não foi possível ler a imagem"));
    leitor.readAsDataURL(arquivo);
  });
}

const botaoEstilo: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-2)",
  fontSize: 12,
  cursor: "pointer",
};

const chipEstilo: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 6px",
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  fontSize: 11.5,
  color: "var(--texto-2)",
};

const removerEstilo: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--texto-mudo)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};

const avisoEstilo: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "var(--texto-mudo)",
  lineHeight: 1.5,
};
