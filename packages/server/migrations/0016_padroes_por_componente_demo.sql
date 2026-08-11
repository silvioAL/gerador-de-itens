-- #301 — massa de "Padrões por componente" (`campos_no`), que nunca teve seed.
--
-- ACHADO REAL do usuário, na sequência do #300: a aba mostrava "(0)" e ele
-- perguntou *"parece zerado, isso está correto?"*. Estava — a tabela nasceu
-- vazia em 0001 e nenhuma migração jamais inseriu uma linha. Quem abria a tela
-- via um editor sem nada dentro e não tinha como deduzir para que serve.
--
-- Estes seis campos NÃO são enfeite de demo: são o caso de uso que o próprio
-- usuário descreveu ao justificar o RBAC — *"delegar a gestão de padrões
-- técnicos configuráveis (obrigatórios ou não) a setores específicos da
-- empresa"*. Cada um é algo que Segurança, Arquitetura ou Compliance exigiria
-- de um time de pagamentos, e que hoje vive num confluence que ninguém lê na
-- hora de abrir a demanda.
--
-- Escopo de UM time, e não `__global__`: o ponto da feature é justamente que
-- padrão é DO TIME. Global aqui faria a aba parecer parte do produto, que é o
-- oposto do que ela é.
--
-- `time-portabilidade` e não `time-pagamentos`, por medição: campo `required`
-- deixa o nó VERMELHO, e vermelho bloqueia `Derivar Quebra`. Semear no
-- `time-pagamentos` quebrou quatro specs de cenário de uma vez — a seed estava
-- certa e o time, errado. `time-pagamentos` continua sendo o time de demo
-- limpo (cenários derivam do zero); `time-portabilidade` passa a ser o que
-- demonstra padrão de time exigindo preenchimento.
INSERT INTO "campos_no"
	("time_id", "tipo_no", "key", "label", "type", "required", "opcoes", "ajuda", "permite_na", "ordem", "item_spec")
VALUES
	-- Serviço --------------------------------------------------------------
	(
		'time-portabilidade', 'service', 'runbookPlantao', 'Runbook de plantão (URL)', 'text', true,
		NULL,
		'Link do runbook que o plantonista abre às 3h da manhã. Sem ele, a primeira pessoa a ser acordada descobre o serviço lendo código.',
		false, 1, NULL
	),
	(
		'time-portabilidade', 'service', 'classificacaoDados', 'Classificação do dado que trafega', 'select', true,
		'["Público", "Interno", "Restrito", "PCI-DSS"]'::jsonb,
		'Define o rigor de log, retenção e mascaramento. "PCI-DSS" obriga revisão de Segurança antes do deploy.',
		false, 2, NULL
	),

	-- Tópico Kafka ----------------------------------------------------------
	(
		'time-portabilidade', 'kafka', 'schemaRegistrado', 'Schema registrado no Schema Registry', 'boolean', true,
		NULL,
		'Tópico sem schema registrado quebra todo consumidor no primeiro campo novo. Marcar como falso é decisão consciente, não esquecimento.',
		false, 1, NULL
	),

	-- Tabela SQL ------------------------------------------------------------
	(
		'time-portabilidade', 'sql', 'retencaoLgpd', 'Prazo de retenção (LGPD)', 'text', true,
		NULL,
		'Quanto tempo o dado fica antes do expurgo, e com base em qual obrigação (ex.: "5 anos — art. 37 da Lei 4.595"). Marque N/A se a tabela não guarda dado pessoal.',
		true, 1, NULL
	),

	-- API Externa -----------------------------------------------------------
	(
		'time-portabilidade', 'external', 'homologacaoFornecedor', 'Homologação com o fornecedor', 'select', true,
		'["Não iniciada", "Em andamento", "Homologada em sandbox", "Homologada em produção"]'::jsonb,
		'Integração externa costuma travar aqui, não no código. Saber o estágio na abertura da demanda muda a estimativa.',
		false, 1, NULL
	),
	(
		'time-portabilidade', 'external', 'slasAcordados', 'SLAs acordados por operação', 'lista', false,
		NULL,
		'Uma linha por operação chamada. É o que decide timeout, retry e circuit breaker — sem isso o time chuta 30s e descobre o erro em produção.',
		false, 2,
		'[
			{ "key": "operacao", "label": "Operação", "type": "text", "required": true },
			{ "key": "p95Ms", "label": "p95 acordado (ms)", "type": "number", "required": true },
			{ "key": "acaoNoEstouro", "label": "O que fazer quando estoura", "type": "text", "required": false }
		]'::jsonb
	);
