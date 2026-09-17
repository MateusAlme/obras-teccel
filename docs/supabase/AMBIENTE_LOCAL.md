# Ambiente local de testes (Supabase em Docker)

Banco Postgres + Auth + Storage rodando **local, via Docker**, com o mesmo
schema do projeto — pra testar sem escrever em produção. Nada aqui toca o
Supabase real (`hiuagpzaelcocyxutgdt`).

## Pré-requisito

Docker instalado e rodando. Nada mais — o resto (Postgres, Auth, Storage,
Studio) sobe em containers via `npx supabase`.

## Subir / resetar o banco local

```bash
./scripts/local-db-reset.sh
```

Isso:
1. Sobe o stack local (`supabase start`), zerando o volume anterior se existir.
2. Aplica todas as migrations de `supabase/migrations/` (incluindo `_old/`)
   **na ordem cronológica real**, via `psql` direto — não via
   `supabase db push`/`db reset`. Motivo: várias migrations são datadas só
   por dia (ex.: três em `20250202`, nove em `20260220`) e colidem na chave
   de tracking do CLI, porque em produção nunca passaram pelo CLI — foram
   coladas manualmente no SQL Editor do Supabase. O script contorna isso.
3. Aplica `supabase/seed-local.sql` (usuário admin de teste).

Rode de novo sempre que quiser voltar a um banco limpo.

### O que fica de fora de propósito

- 5 scripts avulsos que nunca foram migration de schema (`EXECUTAR_AGORA.sql`,
  `LIMPAR_TODAS_OBRAS_E_FOTOS.sql`, `finalizar_obra_2222222222.sql`,
  `fix_admin_user*.sql`) — um-tiro/destrutivos, sem sentido num banco vazio.
- `_old/20250121_add_missing_tipos_servico.sql` — abordagem abandonada (ENUM
  pra `tipo_servico`); a migration seguinte (`20250123_fix_tipo_servico...`,
  que roda normalmente) já converte a coluna pra `TEXT`, que é o que produção
  usa hoje.

### Falhas esperadas (cosméticas, sem impacto)

O script pode reportar 2 falhas — são `COMMENT ON` no fim de dois arquivos
(`20250208_storage_rls_policies.sql`, `20250229_funcoes_gerenciar_usuarios_admin.sql`),
metadata de documentação, não afetam tabela/função/policy nenhuma. Tudo antes
do `COMMENT` já foi aplicado normalmente. Se aparecer qualquer *outra* falha,
investigar antes de considerar o banco pronto.

## Credenciais do banco local

| O quê | Valor |
|---|---|
| Studio (UI do banco) | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Admin do painel web | `admin@local.test` / `admin123` |
| Equipe (mobile) | ex. `CNT 01` / `Teccel2025` (já vem seedado pela própria migration de login por equipe) |

## Painel web (`web/`)

`web/.env.development.local` já aponta pro banco local. O Next.js carrega
esse arquivo **só em `npm run dev`**, com prioridade sobre `web/.env.local`
(que continua com as credenciais de produção). Ou seja:

- `npm run dev` → local, por padrão. Não precisa trocar nada.
- `npm run build && npm start` (produção) → usa `.env.local`, produção normal.

## App mobile (`mobile/`)

`mobile/lib/supabase.ts` e `mobile/lib/photo-queue.ts` agora leem
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (com fallback pra
produção se não estiverem definidas — builds EAS continuam intocados, porque
`mobile/.env.local` está no `.gitignore` e não sobe no build).

`mobile/.env.local` já vem com essas vars, mas **`127.0.0.1` só funciona se o
Expo estiver rodando no mesmo host que o Docker** (web/Expo Go no navegador,
ou simulador iOS no mesmo Mac). Ajuste o host conforme onde for testar:

| Onde testa | Host a usar em `EXPO_PUBLIC_SUPABASE_URL` |
|---|---|
| Simulador iOS (mesma máquina) | `http://127.0.0.1:54321` (padrão já deixado) |
| Emulador Android | `http://10.0.2.2:54321` |
| Celular físico na mesma rede | `http://<IP-da-máquina-na-LAN>:54321` |

Pra voltar o mobile a apontar pra produção, comente as duas linhas
`EXPO_PUBLIC_SUPABASE_*` em `mobile/.env.local` (ou apague o arquivo — o
fallback hardcoded assume produção).

**Lembrete do projeto**: Expo Go não roda este app (precisa dev client —
Skia, Sentry, view-shot). Ver `docs/placa/PLACA_MOBILE_EXPO_GO_LIMITACAO.md`.

## Storage local

O bucket `obra-photos` já é criado pelas migrations. Fotos enviadas em teste
local ficam no volume Docker, não em produção — pra limpar, é só rodar o
reset script de novo.
