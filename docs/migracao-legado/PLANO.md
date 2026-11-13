# Plano: aposentar o formulário legado (`nova-obra`) e ficar só no padrão novo

Data: 12/11/2026. Estado: proposta, nada implementado.

## 1. Situação atual

O padrão novo é a arquitetura 1:N: uma obra tem vários serviços, cada um na tabela `servicos`,
com as fotos independentes (`mobile/types/servico.ts`, `SERVICO_PHOTO_MAP`). O padrão legado é a
tela `mobile/app/nova-obra.tsx` (12 mil linhas), que grava tudo nas colunas da tabela `obras`.

Só que o `nova-obra` hoje não é apenas legado. Ele cumpre três papéis:

| Papel | Quem entra nele | Estado |
|---|---|---|
| A. Criar obra pelo formato antigo | botão de nova obra do perfil compressor (`app/(comp)/index.tsx`, linha 607) | legado puro |
| B. Editar obra antiga e rascunhos | `obra-detalhe.tsx` (linhas 649 e 1751) e `obra-books.tsx` (linha 1705) | legado puro |
| C. Editar serviços por poste do padrão novo | `obra-books.tsx` (linha 2063), com `contextServicoId` e uma ponte que monta o payload a partir do serviço mais os dados legados | padrão novo, mas ainda no formulário antigo |

O papel C é o que impede apagar o arquivo agora.

## 2. Os 18 serviços e para onde cada um vai

| Grupo | Serviços | Onde é editado hoje | Destino |
|---|---|---|---|
| Fotos simples | APR, Abertura e Fechamento de Chave, Altimetria, Bandolamento, Ditais, Documentação, Emenda, Instalação do Medidor, Poda, Registro de Impedimento, Vazamento e Limpeza de Transformador, Teste | `servico-detalhe.tsx` | já no padrão novo, nada a migrar |
| Por postes | Book de Aterramento, Cava em Rocha, Fundação Especial, Linha Viva | `nova-obra.tsx` (papel C) e `postes-registro.tsx` | consolidar em `postes-registro.tsx` |
| Telas dedicadas | Checklist de Fiscalização, Transformador | `checklist-fiscalizacao.tsx` e `transformador.tsx` | já no padrão novo, nada a migrar |

Ou seja, o trabalho de verdade está em quatro serviços (os por postes), mais o compressor e as
obras antigas.

## 3. Etapas

Cada etapa só começa quando a anterior passou no teste do final dela.

### Etapa 0. Base estável (antes de qualquer migração)

- Commitar e enviar o que já está pronto: correções de fotos e de concorrência, conflitos de merge
  do mobile e do web, tema, migração das colunas `fotos_transformador_conexoes_*`.
- Terminar a rodada de teste offline para online dos 15 tipos pelo formulário legado e a rodada
  equivalente pelo padrão novo. Esses testes viram a régua de comparação das etapas seguintes.
- Contar no banco de produção quantas obras têm fotos só nas colunas legadas de `obras` e quantas
  já têm linha em `servicos`. Essa contagem decide o tamanho da Etapa 3.

Pronto quando: `tsc` do mobile e do web sem erros, testes offline verdes, contagem registrada.

### Etapa 1. Compressor entra pelo padrão novo (papel A)

- Trocar o botão de `(comp)/index.tsx` para o fluxo `nova-obra-rapida` e o serviço Cava em Rocha
  por postes.
- Conferir no RLS que o compressor lê e atualiza `servicos` da própria equipe (a política já
  cobre `compressor`, mas o cenário nunca foi testado de ponta a ponta).
- A regra antiga "compressor só mexe em Cava em Rocha" (política de `obras`) precisa ter
  equivalente em `servicos`; hoje `servicos` não restringe por tipo.

Pronto quando: um compressor cria obra, faz Cava em Rocha offline, sincroniza, e o web mostra.

### Etapa 2. Serviços por postes saem do formulário antigo (papel C)

- Primeira tarefa: lista de paridade entre `nova-obra.tsx` e `postes-registro.tsx` (campos,
  validações, numeração de postes, aditivos, medição). O que faltar em `postes-registro` é
  implementado antes de trocar a rota.
- Trocar `handleOpenLegacyObraEditor` e a rota com `contextServicoId` para `postes-registro`,
  mantendo o formato de `postes_data` idêntico, para o web continuar lendo igual.
- Remover a ponte de montagem do payload em `obra-books.tsx` (a função de fallback de postes
  achatados) só depois de a rota nova estar em uso.

Pronto quando: os quatro serviços por postes são criados e editados só por `postes-registro`,
com fotos offline conferidas (harness mais emulador) e o web exibindo igual.

### Etapa 3. Obras antigas passam a ser só leitura (papel B)

- `obra-detalhe.tsx` e `obra-books.tsx` deixam de abrir `nova-obra` para editar.
- DECIDIDO (12/11/2026): conversão sob demanda. Ao abrir uma obra legada para editar, o app cria
  o serviço correspondente em `servicos` a partir das colunas antigas, uma única vez, e passa a
  editar pelo padrão novo. As colunas antigas ficam intactas como histórico. A conversão em lote
  no servidor fica descartada.
- O conversor já existe e está testado: `mobile/lib/obra-legada-para-servico.ts` (função pura,
  ainda não ligada a nenhuma tela). Regras dele:
  - lê a obra, nunca a altera; o `client_pk` é derivado do id da obra, então converter duas vezes
    não duplica;
  - copia só os campos do tipo de serviço (mapa `SERVICO_PHOTO_MAP`); para Transformador e
    Checklist copia todos os campos `fotos_transformador_*` e `fotos_checklist_*`;
  - serviços por poste levam `postes_data`; se a obra só tem fotos achatadas (antes, durante,
    depois), elas viram um poste P1, e o resultado avisa disso;
  - Transformador: o modo (instalado, retirado, ambos) vem do status declarado ou é inferido das
    fotos presentes;
  - devolve a contagem de itens por campo na origem e no destino; `conferido` só é verdadeiro se
    nada se perdeu, e quem chama deve abortar a troca de tela se vier falso.
  - testado para os 18 tipos mais casos de borda (27 verificações).
- LIGADO em 13/11/2026 (sem teste no emulador): `mobile/lib/converter-obra-legada.ts` é chamado por `obra-books.tsx` ao tocar numa obra legada de tipo simples; grava o serviço local com `client_pk` `svc_legado_...` (idempotente) e aborta se `conferido` for falso. Serviços por poste, Transformador e Checklist continuam no formulário antigo até a Etapa 2.
- Falta ligar o conversor: ao abrir a obra legada, converter, gravar o serviço (local e depois
  sync) e abrir `servico-detalhe` ou `postes-registro`. Isso depende da Etapa 2 para os serviços
  por poste.
- Rascunhos legados pendentes nos aparelhos precisam sincronizar antes (ver Etapa 4).

Pronto quando: abrir, editar e finalizar uma obra antiga funciona pelo padrão novo, e o web
mostra o histórico sem perda.

### Etapa 4. Remoção do código legado

Só depois de pelo menos um ciclo de uso em campo sem erros nas etapas 1 a 3:

- Lançar uma versão de transição que ainda sincroniza rascunhos e fotos pendentes no formato
  legado, e esperar os aparelhos esvaziarem as filas (`@obras_pending_sync`, fila de fotos).
- Depois, apagar `nova-obra.tsx`, os caminhos de sync legados em `offline-sync.ts` e os
  componentes só usados por ele.
- Colunas legadas em `obras` NÃO são apagadas nesta etapa. O web e os relatórios antigos ainda
  leem. Apagar coluna é decisão separada, com backup.

Pronto quando: `nova-obra.tsx` removido, sem referências no mobile, `tsc` e testes verdes.

## 4. Riscos e como tratar

1. **Foto offline no formato antigo.** Rascunho com foto pendente num aparelho precisa subir
   antes de o código legado sair. Tratado pela versão de transição da Etapa 4.
2. **Obras antigas em produção.** Nunca sobrescrever colunas legadas. A conversão só adiciona
   linhas em `servicos`.
3. **Versões de app em campo ao mesmo tempo.** Mudanças de banco precisam ser aditivas
   (`ADD COLUMN IF NOT EXISTS`), como a migração de 12/11.
4. **Perfil compressor.** É o menos testado do padrão novo; a Etapa 1 existe por causa dele.
5. **Segurança.** As políticas de acesso do banco liberam tudo quando não há sessão de equipe
   (`get_session_role() IS NULL`). Isso não impede a migração, mas deve ser tratado como projeto
   próprio, depois da Etapa 3, para não quebrar web e mobile juntos.

## 5. Como cada etapa é testada

- Harness de armazenamento e fila (offline, 3G, queda de rede, concorrência, volume), com os 78
  tipos de foto.
- Emulador: ciclo offline para online por tipo de serviço, comparando fotos tiradas, metadados
  locais, colunas no banco e objetos no Storage.
- Web: conferir a obra e o serviço no painel, com as fotos aparecendo na seção certa.

## 6. Decisões que precisam de você

1. Conversão de obras antigas: RESPONDIDO, sob demanda.
2. O compressor continua restrito a Cava em Rocha no padrão novo?
3. Quanto tempo de uso em campo antes da Etapa 4 (uma semana, um mês)?
