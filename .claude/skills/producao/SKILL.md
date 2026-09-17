---
name: producao
description: Publica alterações em produção — valida, faz commit no padrão do repositório e dá push para master. Use quando o usuário pedir para subir, publicar, mandar para produção, fazer commit e push, ou invocar /producao. O push para master dispara o deploy automático do painel web na Vercel.
---

# Publicar em produção (ObrasWise)

Push para `master` = deploy automático do painel web na Vercel. **Todo push é ir ao ar.**
Nunca faça push sem passar pelas verificações abaixo.

## Contexto do repositório

- Remote: `origin` → `https://github.com/MateusAlme/obras-wise-mobile.git`
- Branch de produção: `master` (trabalha-se direto nela)
- Apps: `web/` (Next.js 16, deploy Vercel) e `mobile/` (Expo 54, release manual por EAS)

## ARMADILHA: ruído de CRLF

O repositório normaliza fim de linha para LF (`.gitattributes`), mas a cópia local está em
CRLF. Por isso `git status` mostra **81 arquivos modificados que não têm nenhuma mudança real**.

**Nunca use `git add -A`, `git add .` ou `git commit -a`** — eles arrastariam esses 81 arquivos
para dentro do commit.

Para descobrir o que mudou de verdade:

```bash
git diff --ignore-cr-at-eol --name-only
git diff --ignore-cr-at-eol --stat
```

Se um arquivo aparece em `git status` mas **não** nessa lista, ele é ruído de CRLF: ignore.
Stage sempre arquivo por arquivo, só os da lista real (mais os arquivos novos, que aparecem
como `??` em `git status -s` e precisam ser avaliados um a um).

## Passo a passo

### 1. Levantar o que mudou

```bash
git status -s
git diff --ignore-cr-at-eol --stat
git log --oneline -5
```

Leia o diff real das mudanças antes de commitar. Se não houver mudança real nenhuma,
avise o usuário e pare — não faça commit vazio nem commit de CRLF.

### 2. Varredura de segredos (obrigatória)

Antes de qualquer `git add`, confirme que nada sensível está entrando:

```bash
git status -s | grep -iE "\.env|\.jks|\.keystore|service.role|secret|credential"
```

Bloqueadores — se qualquer um aparecer, **pare e avise o usuário**:

- `web/.env.local` (contém `SUPABASE_SERVICE_ROLE_KEY`, que dá acesso total ao banco)
- qualquer `.env` ou `.env.*`
- `mobile/*.jks` / `.keystore` (chaves de assinatura do app Android)
- chaves `service_role` do Supabase coladas dentro de código

Depois de dar stage, confira o que foi realmente staged:

```bash
git diff --cached --name-only
git diff --cached | grep -iE "service_role|SUPABASE_SERVICE_ROLE|BEGIN .*PRIVATE KEY|password\s*=" || echo "nenhum segredo aparente"
```

Nota: a anon key do Supabase em `mobile/lib/supabase.ts` é pública por design (protegida por
RLS) e já está versionada — não é bloqueador.

### 3. Build do web (quando `web/` mudou)

Se algum arquivo staged estiver em `web/`, rode o build antes do commit:

```bash
cd web && npm run build
```

Se falhar, **não commite**: corrija o erro primeiro. Um build quebrado vira deploy quebrado
na Vercel. Se `web/node_modules` não existir, rode `npm install` em `web/` antes.

Se só mudou `mobile/`, `docs/`, `scripts/` ou `supabase/`, pule este passo.

### 4. Bump de versão do mobile (quando `mobile/` mudou)

Mudança em `mobile/` que vai virar release precisa subir a versão em **cinco** lugares,
que devem ficar sempre em sincronia:

| Arquivo | Campo |
|---|---|
| `mobile/package.json` | `version` |
| `mobile/app.json` | `expo.version` |
| `mobile/app.json` | `expo.android.versionCode` (inteiro, +1) |
| `mobile/app.json` | `expo.ios.buildNumber` (string, +1) |
| `mobile/app/(tabs)/profile.tsx` e `mobile/app/(comp)/profile.tsx` | fallback `?? '2.2.1'` na linha de "Versão" |

Estado atual: version `2.2.1`, `versionCode` 13, `buildNumber` "8".

Critério: correção de bug → patch (2.2.1 → 2.2.2); funcionalidade nova → minor (2.3.0).
`versionCode` sempre +1 em qualquer release. Pergunte ao usuário se há dúvida se a mudança
é um release ou só um ajuste intermediário — nem toda mudança em `mobile/` precisa de bump.

O bump vai no mesmo commit da mudança, ou num commit `chore(mobile): release X.Y.Z` logo em
seguida (é o padrão do histórico). Este skill **não** dispara build EAS — o APK é gerado à
parte pelo usuário.

### 5. Commit

Conventional Commits, **em português**, com escopo. Padrão do histórico:

```
fix(web/servico): respeitar ordem das galerias ao renderizar postes estruturados
feat(web/xlsx): reescrever export de obra individual no formato Linha Viva
fix(mobile/sync): corrigir perda da primeira foto tirada logo após criar serviço
chore(mobile): release 2.2.1 — sync guard, hardening de crashes, perf de conversão JSONB
docs: reorganizar 161 .md em 8 subpastas semânticas
```

Regras do assunto: minúscula, imperativo, sem ponto final, até ~72 caracteres.
Escopos usados: `web/<área>`, `mobile/<área>`, `docs`, `chore`.

O corpo é obrigatório quando a mudança não é trivial, com duas partes: **o que estava errado**
e **o que a mudança faz**. Quebre as linhas em ~72 colunas. Quando corrigir um commit anterior,
cite o hash dele (ex.: "O fix anterior (b969a02) inseriu...").

Termine com o trailer de atribuição:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Use heredoc com aspas simples para a mensagem, para o shell não expandir `$` nem crase:

```bash
git commit -m @'
fix(web/foto): <assunto>

<corpo>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
'@
```

(No Bash use `git commit -F -` com heredoc `<<'EOF'`.)

### 6. Push — confirme com o usuário

**Antes do push, mostre ao usuário o que vai ao ar e peça confirmação explícita.**
Push para `master` publica na hora; não é um passo reversível sem custo.

```bash
git push origin master
```

Depois do push, confirme o resultado e diga ao usuário que o deploy da Vercel foi disparado.
Se o push for rejeitado por divergência, **não force**: rode `git pull --rebase origin master`,
resolva e refaça.

## Nunca

- `git add -A` / `git add .` / `git commit -a` (arrasta o ruído de CRLF)
- `git push --force` em `master`
- push sem confirmação do usuário
- commitar com `next build` quebrado
- commitar `.env*`, `.jks` ou chave `service_role`
