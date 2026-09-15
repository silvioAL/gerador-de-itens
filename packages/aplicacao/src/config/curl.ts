/**
 * SPEC-118 fatias A e B — **o cURL como ENTRADA da tela de configuração.**
 *
 * ## O laço que este módulo fecha, e ele foi aberto pelo próprio produto
 *
 * O campo `metodo` e o campo `envelope` de `DestinoDoGateway` existem por causa
 * desta frase, citada no código desde o §346:
 *
 * > *"é possível que existam diferentes agentes no gateway… **o curl da
 * > chamada** vai conter variações entre agentes"*
 *
 * **Os campos foram derivados de um cURL que ninguém nunca colou.** O produto
 * pedia à pessoa que lesse o curl dela, decompusesse mentalmente em verbo,
 * cabeçalhos, endereço e formato do corpo, e redigitasse cada pedaço num
 * formulário diferente.
 *
 * Não é conveniência de digitação. É a diferença entre uma configuração que
 * alguém confere contra o que funciona no terminal e uma que alguém
 * transcreve — e transcrição é onde some uma barra, um header, um `/v1`.
 *
 * ## O dialeto, e por que só um
 *
 * > *"curl exportado do postman"* — o usuário, respondendo a pergunta 1.
 *
 * Isso recorta o trabalho muito mais nitidamente que "suportar cURL". O que o
 * Postman exporta tem forma previsível: flags longas (`--location`,
 * `--header`, `--data`), continuação com `\` e aspas simples, um dialeto só, e
 * ele é o bash. As formas curtas (`-H`, `-d`, `-X`) entram de brinde.
 *
 * Fora do caminho crítico, por decisão: o dialeto `cmd` (`^`), o PowerShell
 * (`Invoke-WebRequest`) e o `--compressed` do DevTools.
 *
 * ## O que ele RECUSA
 *
 * **Parse parcial silencioso.** Um texto que não é um curl preencheria metade
 * do formulário e deixaria a outra metade com o valor antigo — e ninguém
 * descobriria até a chamada falhar em produção. Recusa nomeada, sempre.
 *
 * **Executar.** Interpretar não é rodar. O "Testar conexão" é outro gesto,
 * deliberado, e continua sendo.
 */

export interface CurlInterpretado {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  /** O corpo cru, como veio no `--data`. Vazio quando não há. */
  corpo: string;
}

export interface RecusaDeCurl {
  /** A frase que a tela mostra. Nomeada, nunca "erro ao interpretar". */
  erro: string;
}

export type ResultadoDoCurl = CurlInterpretado | RecusaDeCurl;

export function ehRecusa(r: ResultadoDoCurl): r is RecusaDeCurl {
  return "erro" in r;
}

/**
 * As flags que o produto entende. O que não estiver aqui é **ignorado**, não
 * recusado — e a distinção é deliberada:
 *
 * `--location` é comportamento do cliente (seguir redirect), não configuração;
 * `--compressed`, `-k`, `--insecure` idem. Recusar o curl inteiro por causa
 * delas faria o produto rejeitar exatamente os curls que as pessoas têm.
 *
 * `--form` (multipart) fica de fora do escopo porque nenhuma operação deste
 * produto manda multipart — e um curl de formulário interpretado como JSON
 * produziria uma configuração que falha na primeira chamada.
 */
const FLAGS_COM_VALOR = new Set([
  "-H",
  "--header",
  "-X",
  "--request",
  "-d",
  "--data",
  "--data-raw",
  "--data-binary",
  "-u",
  "--user",
]);

/**
 * Quebra a linha de comando respeitando aspas e continuação de linha.
 *
 * Um `split(" ")` ingênuo partiria `-H 'Authorization: Bearer abc'` em três, e
 * o cabeçalho chegaria truncado no primeiro espaço — o tipo de defeito que
 * passa nos testes com header curto e falha com o real.
 */
function partirEmTokens(texto: string): string[] {
  const tokens: string[] = [];
  let atual = "";
  let aspas: '"' | "'" | null = null;
  let temConteudo = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    // Continuação de linha do bash: a barra e a quebra somem, e o que vem
    // depois é o mesmo comando.
    if (!aspas && c === "\\" && (texto[i + 1] === "\n" || texto[i + 1] === "\r")) {
      i += texto[i + 1] === "\r" && texto[i + 2] === "\n" ? 2 : 1;
      continue;
    }
    // Escape dentro de aspas duplas — o Postman usa quando o corpo tem `"`.
    if (aspas === '"' && c === "\\" && texto[i + 1]) {
      atual += texto[i + 1];
      i++;
      temConteudo = true;
      continue;
    }
    if (!aspas && (c === '"' || c === "'")) {
      aspas = c;
      // Aspas vazias são um token: `--data ''` é um corpo vazio DECLARADO.
      temConteudo = true;
      continue;
    }
    if (aspas === c) {
      aspas = null;
      continue;
    }
    if (!aspas && /\s/.test(c)) {
      if (temConteudo) tokens.push(atual);
      atual = "";
      temConteudo = false;
      continue;
    }
    atual += c;
    temConteudo = true;
  }
  if (temConteudo) tokens.push(atual);
  return tokens;
}

function cabecalhoDe(bruto: string): [string, string] | undefined {
  const i = bruto.indexOf(":");
  if (i <= 0) return undefined;
  const chave = bruto.slice(0, i).trim();
  const valor = bruto.slice(i + 1).trim();
  return chave ? [chave, valor] : undefined;
}

export function interpretarCurl(texto: string): ResultadoDoCurl {
  const limpo = texto.trim();
  if (!limpo) return { erro: "cole o curl da chamada que já funciona no seu terminal." };

  const tokens = partirEmTokens(limpo);
  if (tokens[0] !== "curl") {
    return {
      erro: "não reconheci este formato — esperava um comando começando com `curl` (o que o Postman exporta em “Copy as cURL”).",
    };
  }

  let url = "";
  let metodo = "";
  let corpo = "";
  const cabecalhos: Record<string, string> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (FLAGS_COM_VALOR.has(token)) {
      const valor = tokens[++i];
      if (valor === undefined) return { erro: `a flag ${token} veio sem valor — o comando parece estar cortado.` };

      if (token === "-H" || token === "--header") {
        const par = cabecalhoDe(valor);
        // Cabeçalho sem `:` é o comando cortado no meio, não um cabeçalho
        // vazio — recusar é mais honesto que guardar lixo.
        if (!par) return { erro: `não entendi o cabeçalho “${valor}” — esperava o formato “Chave: valor”.` };
        cabecalhos[par[0]] = par[1];
        continue;
      }
      if (token === "-X" || token === "--request") {
        metodo = valor.toUpperCase();
        continue;
      }
      if (token === "-u" || token === "--user") {
        // Basic auth do curl. Vira cabeçalho porque é o que ele é na rede — e
        // assim ele passa pela mesma separação de segredo da fatia B.
        cabecalhos["Authorization"] = `Basic ${valor}`;
        continue;
      }
      corpo = valor;
      continue;
    }

    /**
     * `--form` recusa em vez de ignorar, e a razão é a da §3.3: nenhuma
     * operação deste produto manda multipart. Ignorá-lo produziria uma
     * configuração com endereço certo e corpo errado — que falha na primeira
     * chamada, longe daqui.
     */
    if (token === "-F" || token === "--form") {
      return { erro: "este curl manda um formulário (multipart), e nenhuma operação deste produto usa esse formato." };
    }

    // Flags sem valor que o produto não precisa conhecer (--location,
    // --compressed, -k…). Ignoradas de propósito — ver `FLAGS_COM_VALOR`.
    if (token.startsWith("-")) continue;

    // O primeiro token solto é o endereço. Um segundo seria outra URL no mesmo
    // comando, e aí o curl descreve duas chamadas — fora do escopo (§3.2).
    if (!url) url = token;
  }

  if (!url) return { erro: "não achei o endereço neste curl — ele precisa ter a URL da chamada." };
  if (!/^https?:\/\//i.test(url)) {
    return { erro: `o endereço “${url}” não começa com http:// ou https://.` };
  }

  return {
    url,
    /**
     * *"O Postman omite `--request POST` quando há `--data`"* (§3.3). Ausência
     * de verbo COM corpo é `POST` — é o que o próprio cURL faz, e já é o padrão
     * do produto. Sem corpo e sem verbo, `GET`.
     */
    metodo: metodo || (corpo ? "POST" : "GET"),
    cabecalhos,
    corpo,
  };
}

/**
 * SPEC-118 fatia B — **a chave sai dos cabeçalhos e vira segredo.**
 *
 * ## Por que esta é a régua mais importante da SPEC
 *
 * Um curl copiado de um terminal que funciona **contém o segredo real**. Uma
 * caixa de texto onde se cola um curl é um lugar novo por onde a chave passa:
 * ela pode ficar num `value` de textarea, num screenshot de suporte, num undo
 * buffer, num relatório de erro.
 *
 * > *"É a única cujo erro é irreversível: chave vazada não se desvaza."*
 *
 * As três regras da §3.1, e esta função implementa a segunda: a chave sai dos
 * `cabecalhos` e vai para o campo de segredo. A primeira (o campo de colar é
 * efêmero) e a terceira (a tela DIZ que separou) são da tela.
 *
 * ## O que conta como segredo, e por que a lista é curta
 *
 * `Authorization` e os cabeçalhos que carregam chave por convenção. Uma
 * heurística mais esperta — "qualquer valor com mais de 20 caracteres" —
 * classificaria um `X-Team: pagamentos-fraude-antifraude` como segredo e o
 * esconderia de quem precisa conferi-lo. Errar para menos aqui deixa um
 * cabeçalho visível; errar para mais esconde configuração.
 */
const CABECALHOS_DE_SEGREDO = ["authorization", "x-api-key", "api-key", "x-auth-token", "proxy-authorization"];

export interface CurlComSegredoSeparado {
  /** O que sobrou — sem o cabeçalho de autenticação. */
  cabecalhos: Record<string, string>;
  /** O valor bruto do cabeçalho de segredo, se havia um. É o que vai para o cofre. */
  chave?: string;
  /** Qual cabeçalho carregava a chave — a tela DIZ isso (regra 3 da §3.1). */
  cabecalhoDaChave?: string;
}

export function separarSegredo(cabecalhos: Record<string, string>): CurlComSegredoSeparado {
  const entradas = Object.entries(cabecalhos);
  const daChave = entradas.find(([k]) => CABECALHOS_DE_SEGREDO.includes(k.toLowerCase()));
  if (!daChave) return { cabecalhos };

  return {
    cabecalhos: Object.fromEntries(entradas.filter(([k]) => k !== daChave[0])),
    chave: daChave[1],
    cabecalhoDaChave: daChave[0],
  };
}

/**
 * SPEC-118 §2.0 — **um curl ingênuo destrói a herança que a SPEC-81 construiu.**
 *
 * ## A correção do usuário, e o que ela encontra pronto
 *
 * > *"os agentes no gateway vou deixar no gateway… o gateway é o mesmo mas pode
 * > variar o endpoint"*
 *
 * `DestinoDoGateway.cabecalhos` é opcional de propósito desde a SPEC-81:
 * *"ausente = usa os cabeçalhos compartilhados; declarado vence herdado"*. O
 * modelo do usuário é exatamente o primeiro caso, e o produto já o suporta.
 *
 * **Mas cada curl colado traz o `Authorization` dentro dele.** Escrevê-lo no
 * destino faria cada destino ter a sua cópia da chave — e aí:
 *
 * - rotacionar a chave vira edição em N lugares, e a que alguém esquecer falha
 *   semanas depois, sozinha;
 * - a chave passa a existir em N linhas do documento em vez de uma;
 * - a herança vira código morto, sem ninguém decidir isso.
 *
 * ## A régua, e por que ela compara HOST e não a URL inteira
 *
 * O endpoint é justamente o que varia (`/adr`, `/issues`, `/issues/spec`).
 * Comparar a URL inteira nunca casaria, e a herança continuaria sendo destruída
 * — só que com um mecanismo a mais parecendo protegê-la.
 *
 * Quem aponta para gateways realmente diferentes continua podendo declarar
 * cabeçalhos por destino: a régua do §306 não muda, só deixa de ser acionada
 * por acidente.
 */
export interface GatewayReconhecido {
  /** Host e cabeçalhos casam com os do gateway já configurado. */
  mesmoGateway: boolean;
  /**
   * O que guardar no destino. Vazio quando é o mesmo gateway — o destino herda,
   * e a chave continua existindo numa linha só.
   */
  cabecalhosParaGuardar: Record<string, string>;
}

export function reconhecerGateway(
  url: string,
  cabecalhosDoCurl: Record<string, string>,
  gateway: { endpoint?: string; cabecalhos?: Record<string, string> } | undefined
): GatewayReconhecido {
  const semSegredo = separarSegredo(cabecalhosDoCurl);
  if (!gateway?.endpoint) return { mesmoGateway: false, cabecalhosParaGuardar: semSegredo.cabecalhos };

  const host = (endereco: string) => {
    try {
      return new URL(endereco).host.toLowerCase();
    } catch {
      return "";
    }
  };
  const mesmoHost = !!host(url) && host(url) === host(gateway.endpoint);
  if (!mesmoHost) return { mesmoGateway: false, cabecalhosParaGuardar: semSegredo.cabecalhos };

  /**
   * Host igual e **nenhum cabeçalho diferente do compartilhado** = o mesmo
   * gateway. Um cabeçalho a mais (`X-Team`) é informação que só existe naquele
   * destino, e ela precisa ser guardada — herdar apagaria a diferença.
   */
  const doGateway = gateway.cabecalhos ?? {};
  const diferentes = Object.fromEntries(
    Object.entries(semSegredo.cabecalhos).filter(([k, v]) => doGateway[k] !== v)
  );

  return {
    mesmoGateway: Object.keys(diferentes).length === 0,
    cabecalhosParaGuardar: diferentes,
  };
}

/**
 * O resumo mascarado, para a tela poder DIZER que reconheceu um segredo sem o
 * mostrar. Mesmo molde do `resumirCredencialIa`, que já resolveu isto para a
 * chave de IA — e é o molde por decisão da §7.
 *
 * Mostra o começo porque é o que permite alguém reconhecer *qual* chave é
 * (`sk-prod…` versus `sk-hml…`) sem que a tela revele o suficiente para usá-la.
 */
export function mascarar(chave: string): string {
  const limpo = chave.trim();
  if (limpo.length <= 8) return "•".repeat(Math.max(limpo.length, 3));
  return `${limpo.slice(0, 6)}…${"•".repeat(4)}`;
}

/**
 * SPEC-118 §2.1 — **a chave de topo do corpo vira o `envelope`.**
 *
 * `{"itens": [...]}` → `"itens"`; corpo sem embrulho → `""`, que é escolha
 * declarada no produto (payload na raiz), e não ausência.
 *
 * Corpo que não é JSON não produz envelope nenhum: `undefined` significa *"não
 * sei"*, e é diferente de `""`. Chutar aqui gravaria um embrulho que o agente
 * do outro lado não espera.
 */
export function envelopeDoCorpo(corpo: string): string | undefined {
  const texto = corpo.trim();
  if (!texto) return undefined;

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return undefined;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;

  const chaves = Object.keys(json as object);
  // Uma chave de topo cujo valor é uma lista ou um objeto é um envelope. Duas
  // ou mais chaves de topo é o payload na raiz — `{"titulo": …, "corpo": …}`
  // não está embrulhado em nada.
  if (chaves.length !== 1) return "";
  const valor = (json as Record<string, unknown>)[chaves[0]];
  return valor !== null && typeof valor === "object" ? chaves[0] : "";
}

/**
 * SPEC-118 fatia E — **o `model` do corpo, quando o curl é de um gateway de IA.**
 *
 * Gateways compatíveis com OpenAI mandam `{"model": "...", "messages": [...]}`.
 * É a única informação do corpo que o produto aproveita — `messages` é a
 * conversa daquela chamada, não configuração.
 */
export function modeloDoCorpo(corpo: string): string | undefined {
  try {
    const json = JSON.parse(corpo.trim()) as { model?: unknown };
    return typeof json?.model === "string" && json.model.trim() ? json.model.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * SPEC-118 fatia E — **a `baseUrl` de um endereço de chat completions.**
 *
 * O curl de um gateway OpenAI-compatível aponta para `…/v1/chat/completions`, e
 * o que o produto guarda é a base (`…/v1`). Recortar aqui é o que faz a prova
 * da fatia: *"configura a conexão sem ninguém digitar `/v1`"*.
 *
 * Endereço que não termina no caminho conhecido volta inteiro: cortar por
 * palpite produziria uma base que não existe, e um endereço completo errado é
 * mais fácil de diagnosticar que um truncado.
 */
export function baseUrlDeChat(url: string): string {
  const semBarra = url.replace(/\/+$/, "");
  const marca = semBarra.toLowerCase().lastIndexOf("/chat/completions");
  return marca > 0 ? semBarra.slice(0, marca) : semBarra;
}
