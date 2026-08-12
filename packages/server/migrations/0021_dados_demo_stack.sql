-- SPEC-38 Fase 2 — o seed de demo que morava em perfis_time (0000_init)
-- replantado no CATÁLOGO: dois perfis nomeados, com os times de exemplo
-- apontando. IDEMPOTENTE de propósito (ON CONFLICT / WHERE IS NULL): a suíte
-- do servidor roda `migrate` por arquivo de teste em paralelo, e a versão
-- não-idempotente quebrou na corrida entre workers.
INSERT INTO perfis_stack (organizacao_id, nome, criado_por)
SELECT o.id, 'Java + Spring Boot', 'seed@gerador.local' FROM organizacoes o LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO perfis_stack (organizacao_id, nome, criado_por)
SELECT o.id, 'Node', 'seed@gerador.local' FROM organizacoes o LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO perfil_stack_valores (perfil_id, tipo_no, campo, valor)
SELECT p.id, v.tipo_no, v.campo, v.valor
FROM perfis_stack p,
  (VALUES
    ('service', 'linguagem', 'Java'),
    ('service', 'framework', 'Spring Boot'),
    ('camunda', 'framework', 'Camunda 7'),
    ('fico', 'motorPadrao', 'FICO Blaze Advisor')
  ) AS v(tipo_no, campo, valor)
WHERE p.nome = 'Java + Spring Boot'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO perfil_stack_valores (perfil_id, tipo_no, campo, valor)
SELECT p.id, 'service', 'linguagem', 'Node' FROM perfis_stack p WHERE p.nome = 'Node'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE times SET perfil_stack_id = (SELECT id FROM perfis_stack WHERE nome = 'Java + Spring Boot' LIMIT 1)
WHERE id = 'time-pagamentos' AND perfil_stack_id IS NULL;--> statement-breakpoint
UPDATE times SET perfil_stack_id = (SELECT id FROM perfis_stack WHERE nome = 'Node' LIMIT 1)
WHERE id = 'time-portabilidade' AND perfil_stack_id IS NULL;
