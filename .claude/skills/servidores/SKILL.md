---
name: servidores
description: Sobe os servidores de desenvolvimento do ObrasWise — painel web (Next.js) e/ou app mobile (Expo/Metro para Expo Go). Use quando o usuário pedir para rodar, subir, iniciar ou ligar o servidor, o site, o painel, o app, o Expo ou o Metro, ou invocar /servidores.
---

# Subir servidores de desenvolvimento (ObrasWise)

Dois servidores independentes. Pergunte qual o usuário quer se ele não disse — subir os dois
sem necessidade só consome recurso da máquina.

| Alvo | Comando base | Porta |
|---|---|---|
| Painel web (Next.js 16) | `npm run dev` em `web/` | 3000 |
| App mobile (Expo/Metro) | `npx expo start` em `mobile/` | 8081 |

## ARMADILHAS DESTE AMBIENTE — leia antes de rodar

Quatro coisas quebram comandos "óbvios" nesta máquina. Todas já foram diagnosticadas:

1. **Node não está no PATH do shell de ferramentas.** Está instalado em
   `C:\Program Files\nodejs` (v24), mas `node` e `npm` retornam "command not found".
   Sempre comece a linha com:
   ```
   $env:Path = "C:\Program Files\nodejs;$env:Path";
   ```

2. **PowerShell 5.1 não aceita `&&`.** Encadeie com `;`. Nada de `cd x && npm run dev`.

3. **A política de execução bloqueia `npx.ps1`.** Se aparecer
   `PSSecurityException / execução de scripts foi desabilitada`, use **`npx.cmd`** em vez de
   `npx`. O `.cmd` não passa pelo PowerShell. Não altere a ExecutionPolicy do sistema por
   conta própria — é configuração de segurança e a decisão é do usuário.

4. **Nunca defina `CI=1` ao subir o Expo.** Metro entra em modo CI e **desativa o hot reload**
   (`Metro is running in CI mode, reloads are disabled`). O servidor sobe, mas nenhuma
   alteração de código chega ao celular.

Suba sempre com `run_in_background: true` — são processos que não terminam. Depois leia o
arquivo de output para confirmar que subiu, em vez de esperar no terminal.

## Painel web

Preferir `preview_start` com `{name: "web"}` — já existe `.claude/launch.json` configurado
(`npm --prefix web run dev`, porta 3000). Isso abre o painel do navegador junto e permite
verificar o resultado.

Pré-requisitos, checados nesta ordem:

- `web/node_modules` existe? Se não: `npm install` dentro de `web/`.
- `web/.env.local` existe? É obrigatório e precisa das três chaves:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  Esse arquivo **não** está no git (é ignorado, e deve continuar assim). Se estiver faltando
  numa máquina nova, peça ao usuário — nunca invente valores nem copie a chave para outro
  lugar.

Comando manual, se `preview_start` não servir:

```
$env:Path = "C:\Program Files\nodejs;$env:Path"; Set-Location "<repo>\web"; npm run dev
```

Acesso: http://localhost:3000

**Conflito de porta conhecido:** `photo-server/server.js` também usa a porta 3000. Os dois não
sobem juntos. O photo-server é um utilitário separado de carimbo de placa e raramente é
necessário — se a porta 3000 estiver ocupada, verifique se não é ele antes de matar processo.

## App mobile (Expo Go)

Pré-requisito: `mobile/node_modules` existe? Num clone novo **não existe** — rode
`npm install` em `mobile/` antes (~1 min, ~1200 pacotes).

Não há `.env` no mobile: a URL e a anon key do Supabase estão direto em
`mobile/lib/supabase.ts`. Não falta configuração de ambiente.

Libere a porta 8081 antes de subir, para evitar `EADDRINUSE` de um Metro anterior:

```
Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

Subir (em background):

```
$env:Path = "C:\Program Files\nodejs;$env:Path"; Set-Location "<repo>\mobile"; npx.cmd expo start --go --lan
```

- `--go` força o modo Expo Go (sem isso, o `expo-dev-client` instalado faz o Expo mirar um
  development build).
- `--lan` serve pela rede local. Para development build, troque `--go` por `--dev-client`.

O servidor está pronto quando o log mostrar `Waiting on http://localhost:8081`.

### Passar o endereço para o celular

Rodando em background não há QR code no terminal. Descubra o IP da máquina e monte a URL:

```
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.' } |
  Select-Object InterfaceAlias, IPAddress
```

Entregue ao usuário no formato `exp://<IP>:8081` (ex.: `exp://192.168.2.176:8081`), e lembre
que no Expo Go ele deve usar **"Enter URL manually"**, com o celular no **mesmo Wi-Fi**.
O IP muda quando a rede muda — releia, não reaproveite um IP antigo.

### Limitações reais do Expo Go neste projeto

O app usa módulos nativos que o Expo Go **não** carrega:
`@shopify/react-native-skia`, `react-native-view-shot`, `@bam.tech/react-native-image-resizer`
e `@sentry/react-native`. O app abre e a maior parte funciona, mas o **carimbo de placa nas
fotos falha ou cai em fallback**. Documentado em `docs/placa/PLACA_MOBILE_EXPO_GO_LIMITACAO.md`.
Para testar esse fluxo por inteiro é preciso um development build. Avise o usuário disso se
ele for justamente testar fotos/placa.

### Aviso de versões

O Metro reclama de ~9 pacotes fora da faixa do Expo 54 — o relevante é
`@sentry/react-native@8.0.0` contra `~7.2.0` esperado (uma major de diferença); o resto são
patches. `npx.cmd expo install --fix` alinha tudo, **mas altera `package.json` e vira commit**.
Não rode sem o usuário pedir.

### Login do Expo

**Não é necessário** para conectar o Expo Go por LAN. Só entra em jogo para build EAS.
O projeto pertence à conta `mateus_almeida` (`mobile/app.json`, campos `owner` e
`extra.eas.projectId`), então outras contas precisam ser convidadas como membro em expo.dev
para acessá-lo.

Login envolve senha: **nunca digite credenciais**. Entregue o comando ao usuário para ele
rodar no próprio terminal (`npx.cmd expo login`, ou `npx.cmd expo login --sso` para contas
criadas via Google).

## Encerrar

Use `TaskStop` com o id da tarefa em background. Para o web iniciado por `preview_start`,
use `preview_stop` com o `serverId`.
