-- Massa de dados fake pra demo (achado do usuário: as features desta sessão
-- — cache/storage/batch/gRPC/GraphQL, referências com código relacionado —
-- não tinham nenhum dado persistido de exemplo, então um banco recém-criado
-- não mostrava nada delas. Mesmo raciocínio das seeds de 0000_init.sql/
-- 0001_auth_e_campos_no.sql (INSERT direto na migração, não script à parte).

-- Uma quebra salva demonstrando os 5 tipos/edges novos do catálogo (JOURNEY
-- §28) juntos — nós e specs copiados literalmente dos cenários já validados
-- em config/cenarios/{cache,storage,batch,grpc,graphql}.json (renumerados
-- pra caber num diagrama só), não reinventados aqui.
INSERT INTO "quebras" ("time", "diagrama") VALUES (
	'time-pagamentos',
	$$
	{
		"nodes": [
			{
				"id": "n1", "type": "service", "status": "novo", "label": "srv-recomendacao",
				"x": 100, "y": 100,
				"spec": {
					"nome": { "valor": "srv-recomendacao", "origem": "manual" },
					"linguagem": { "valor": "Java", "origem": "manual" },
					"framework": { "valor": "Spring Boot", "origem": "manual" }
				},
				"specNA": { "contratoEndpoints": { "motivo": "não expõe REST nesta quebra, só consome gRPC" } },
				"endpoints": []
			},
			{
				"id": "n2", "type": "service", "status": "existente", "label": "srv-catalogo",
				"x": 400, "y": 100,
				"spec": {
					"nome": { "valor": "srv-catalogo", "origem": "manual" },
					"migracao": { "valor": "Método gRPC novo — não impacta os consumidores REST já existentes.", "origem": "manual" },
					"contratoGrpc": {
						"valor": "service CatalogoService { rpc BuscarProduto(BuscarProdutoRequest) returns (Produto); } message BuscarProdutoRequest { string sku = 1; } message Produto { string sku = 1; string nome = 2; int64 preco_centavos = 3; }",
						"origem": "manual"
					}
				},
				"specNA": { "linguagem": { "motivo": "serviço existente, stack não verificada nesta quebra" } },
				"endpoints": []
			},
			{
				"id": "n3", "type": "service", "status": "novo", "label": "srv-painel-admin",
				"x": 700, "y": 100,
				"spec": {
					"nome": { "valor": "srv-painel-admin", "origem": "manual" },
					"linguagem": { "valor": "Node", "origem": "manual" },
					"framework": { "valor": "Next.js", "origem": "manual" }
				},
				"specNA": { "contratoEndpoints": { "motivo": "não expõe REST nesta quebra, só consome GraphQL" } },
				"endpoints": []
			},
			{
				"id": "n4", "type": "service", "status": "existente", "label": "srv-pedidos",
				"x": 1000, "y": 100,
				"spec": {
					"nome": { "valor": "srv-pedidos", "origem": "manual" },
					"migracao": { "valor": "Endpoint GraphQL novo ao lado do REST já existente — não substitui nem quebra os consumidores REST atuais.", "origem": "manual" },
					"contratoGraphql": {
						"valor": "type Query { pedido(id: ID!): Pedido pedidosPorCliente(clienteId: ID!, status: StatusPedido): [Pedido!]! } type Pedido { id: ID! status: StatusPedido! itens: [ItemPedido!]! cliente: Cliente! } enum StatusPedido { PENDENTE PAGO ENVIADO CANCELADO }",
						"origem": "manual"
					}
				},
				"specNA": { "linguagem": { "motivo": "serviço existente, stack não verificada nesta quebra" } },
				"endpoints": []
			},
			{
				"id": "n5", "type": "service", "status": "existente", "label": "srv-frete",
				"x": 1300, "y": 100,
				"spec": {
					"nome": { "valor": "srv-frete", "origem": "manual" },
					"migracao": { "valor": "Sem mudança no contrato do serviço — só passa a consultar o cache antes de chamar o provedor.", "origem": "manual" }
				},
				"specNA": { "linguagem": { "motivo": "serviço existente, stack não verificada nesta quebra" } },
				"endpoints": []
			},
			{
				"id": "n6", "type": "cache", "status": "novo", "label": "cache-cotacao-frete",
				"x": 100, "y": 320,
				"spec": {
					"nome": { "valor": "frete:cotacao:{cepOrigem}:{cepDestino}:{pesoKg}", "origem": "manual" },
					"tecnologia": { "valor": "Redis", "origem": "manual" },
					"ttlSegundos": { "valor": 600, "origem": "manual" },
					"politicaEviction": { "valor": "LRU", "origem": "manual" },
					"persistencia": { "valor": false, "origem": "manual" },
					"invalidacao": { "valor": "só TTL", "origem": "manual" },
					"contratoValor": {
						"valor": "{ transportadora: string, prazoDias: number, valorCentavos: number, calculadoEm: ISODate }",
						"origem": "manual"
					}
				},
				"specNA": {}
			},
			{
				"id": "n7", "type": "service", "status": "novo", "label": "srv-comprovantes-fiscais",
				"x": 400, "y": 320,
				"spec": {
					"nome": { "valor": "srv-comprovantes-fiscais", "origem": "manual" },
					"linguagem": { "valor": "Java", "origem": "manual" },
					"framework": { "valor": "Spring Boot", "origem": "manual" }
				},
				"specNA": {},
				"endpoints": [{ "method": "POST", "path": "/v1/comprovantes", "action": "novo" }]
			},
			{
				"id": "n8", "type": "storage", "status": "novo", "label": "comprovantes-fiscais",
				"x": 700, "y": 320,
				"spec": {
					"bucket": { "valor": "comprovantes-fiscais-prod", "origem": "manual" },
					"prefixoChave": { "valor": "comprovantes/{ano}/{mes}/{pedidoId}.pdf", "origem": "manual" },
					"politicaAcesso": { "valor": "URL pré-assinada (presigned)", "origem": "manual" },
					"criptografiaEmRepouso": { "valor": true, "origem": "manual" },
					"tamanhoMaximoMb": { "valor": 5, "origem": "manual" },
					"cicloDeVida": { "valor": "Retenção mínima de 5 anos por exigência fiscal — sem exclusão automática antes disso.", "origem": "manual" },
					"contratoObjeto": {
						"valor": "PDF gerado a partir do template de nota fiscal. Metadados: pedidoId, emitidoEm, valorTotalCentavos.",
						"origem": "manual"
					}
				},
				"specNA": {}
			},
			{
				"id": "n9", "type": "sql", "status": "existente", "label": "tb_pedidos_pendentes",
				"x": 1000, "y": 320,
				"spec": {
					"tabela": { "valor": "tb_pedidos_pendentes", "origem": "manual" },
					"chavePrimaria": { "valor": "id", "origem": "manual" },
					"volumeEsperado": { "valor": "alto", "origem": "manual" },
					"migracao": { "valor": "Sem mudança no schema existente — só passa a ser lida pelo job novo.", "origem": "manual" }
				},
				"specNA": {
					"indices": { "motivo": "tabela existente, índices já definidos fora desta quebra" },
					"ferramentaMigracao": { "motivo": "sem alteração de schema nesta quebra" },
					"schemaColunas": { "motivo": "tabela existente, schema não muda nesta quebra" }
				}
			},
			{
				"id": "n10", "type": "batch", "status": "novo", "label": "job-fatura-mensal",
				"x": 1300, "y": 320,
				"spec": {
					"nomeJob": { "valor": "job-fatura-mensal", "origem": "manual" },
					"origemDados": { "valor": "tb_pedidos_pendentes (SQL)", "origem": "manual" },
					"destinoDados": { "valor": "tb_faturas (SQL)", "origem": "manual" },
					"chunkSize": { "valor": 200, "origem": "manual" },
					"gatilho": { "valor": "cron", "origem": "manual" },
					"cron": { "valor": "0 3 1 * *", "origem": "manual" },
					"politicaSkip": { "valor": "pula até um limite", "origem": "manual" },
					"limiteSkip": { "valor": 20, "origem": "manual" },
					"politicaRetry": { "valor": true, "origem": "manual" },
					"reiniciavel": { "valor": true, "origem": "manual" },
					"descricao": { "valor": "Consolida pedidos pendentes do mês em faturas únicas por cliente.", "origem": "manual" }
				},
				"specNA": {}
			},
			{
				"id": "n11", "type": "sql", "status": "novo", "label": "tb_faturas",
				"x": 1600, "y": 320,
				"spec": {
					"tabela": { "valor": "tb_faturas", "origem": "manual" },
					"chavePrimaria": { "valor": "id", "origem": "manual" },
					"indices": { "valor": "cliente_id, competencia", "origem": "manual" },
					"ferramentaMigracao": { "valor": "flyway", "origem": "manual" },
					"volumeEsperado": { "valor": "medio", "origem": "manual" },
					"schemaColunas": {
						"valor": "id uuid PK, cliente_id uuid, competencia date, valor_total_centavos bigint, gerado_em timestamp",
						"origem": "manual"
					}
				},
				"specNA": {}
			}
		],
		"edges": [
			{ "id": "e1", "source": "n1", "target": "n2", "type": "grpc" },
			{ "id": "e2", "source": "n3", "target": "n4", "type": "graphql" },
			{ "id": "e3", "source": "n5", "target": "n6", "type": "readwrite" },
			{ "id": "e4", "source": "n7", "target": "n8", "type": "writes" },
			{ "id": "e5", "source": "n10", "target": "n9", "type": "reads" },
			{ "id": "e6", "source": "n10", "target": "n11", "type": "writes" }
		]
	}
	$$::jsonb
);
--> statement-breakpoint

-- Duas referências novas demonstrando codigoRelacionado + linkExterno
-- (SPEC-16) — a única referência seedada até aqui (0000_init.sql) é anterior
-- a esses dois campos existirem. Uma com link publicado, outra sem (as duas
-- variações que a UI precisa mostrar direito).
INSERT INTO "referencias" ("titulo", "racional", "design_patterns", "codigo_relacionado", "link_externo") VALUES (
	'gerador export-vault: resolver wikilink contra o vault, nunca contra o esquema de nomes do Graphify',
	'O nome de arquivo de cada nota que o Graphify gera não é previsível (desambiguação própria dele pra colisão de nome entre pastas) — o jeito certo de linkar uma referência a uma nota real é escanear o vault já gerado (frontmatter source_file) e usar o nome de arquivo de lá, nunca reimplementar esse esquema. Achado real relacionado: as notas do Graphify usam CRLF, não LF — o parser de frontmatter precisa tolerar os dois. Ver packages/cli/src/commands/exportVault.ts e JOURNEY.md §32.',
	'["Nunca reimplementar o que outra ferramenta já resolve", "Escanear saída real em vez de assumir formato"]'::jsonb,
	'["packages/cli/src/commands/exportVault.ts", "packages/cli/src/commands/exportVault.test.ts"]'::jsonb,
	'https://exemplo-empresa.atlassian.net/wiki/spaces/ENG/pages/48213/Base+de+conhecimento+Obsidian+Graphify'
);
--> statement-breakpoint
INSERT INTO "referencias" ("titulo", "racional", "design_patterns", "codigo_relacionado", "link_externo") VALUES (
	'Critérios de aceite por tipo de nó: o motor direciona a mecânica técnica, nunca a regra de negócio',
	'REST sempre tem 2xx/4xx/5xx, Kafka sempre tem publish/consume/DLQ — isso é conhecimento genérico e replicável, então o motor pode gerar o scaffold Gherkin correspondente sem alucinar. O que o motor nunca inventa é a regra de negócio em si (o "Dado" específico do domínio) — o scaffold fica editável pelo usuário, nunca é a especificação final. Mesmo mecanismo de override do specResumo: o nó ALVO decide, com precedência por tipo de aresta. Ver packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts (resolverCenarioGherkin) e JOURNEY.md §31.',
	'["Motor determinístico não alucina regra de negócio", "Resolução por precedência (aresta > nó > genérico)"]'::jsonb,
	'["packages/engine/src/especificacao/gerarEspecificacaoEntrega.ts", "config/diagrama.example.json"]'::jsonb,
	NULL
);
