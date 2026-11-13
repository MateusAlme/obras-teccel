-- =====================================================
-- Migration: colunas fotos_transformador_conexoes_* em obras
-- Data: 2026-11-12
-- Descrição: o app mobile (offline-sync.ts) e o web gravam e leem
--            fotos_transformador_conexoes_{primarias,secundarias}_{instalado,retirado}
--            em obras, mas a migration 20250217 criou as colunas SEM o prefixo "fotos_"
--            (transformador_conexoes_*). Num banco criado só pelas migrations do
--            repositório, o insert da obra falha com PGRST204.
--            Idempotente: nao altera quem ja tem as colunas.
-- =====================================================

ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS fotos_transformador_conexoes_primarias_instalado   jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fotos_transformador_conexoes_secundarias_instalado jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fotos_transformador_conexoes_primarias_retirado    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fotos_transformador_conexoes_secundarias_retirado  jsonb DEFAULT '[]'::jsonb;

-- PostgREST guarda o schema em cache; avisa para recarregar.
NOTIFY pgrst, 'reload schema';
