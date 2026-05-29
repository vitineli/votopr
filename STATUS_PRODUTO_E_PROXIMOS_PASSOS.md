# Status Do Produto E Proximos Passos

## Contexto

O VotoPR ja esta publicado na Vercel e conectado ao Supabase, mas ainda nao esta utilizavel como ferramenta operacional completa. Hoje ele permite navegar pelas telas principais, criar conta/login e acessar a estrutura do SaaS, porem os modulos centrais ainda dependem da importacao de dados reais para funcionar de verdade.

O principal problema agora nao e "falta de tela". O bloqueio real esta na camada de dados: precisamos carregar geometrias reais no PostGIS e processar o CSV grande do TSE de forma local/worker, sem depender de upload manual pelo navegador.

URL atual:

```text
https://votopr-sable.vercel.app
```

Repositorio:

```text
https://github.com/vitineli/votopr.git
```

## O Que Ja Foi Feito

### Aplicacao

- Projeto Next.js 15 App Router criado.
- TypeScript configurado.
- TailwindCSS configurado.
- shadcn/ui base implementado.
- Layout SaaS com sidebar, topbar e rotas protegidas.
- Telas principais criadas:
  - login;
  - cadastro;
  - recuperacao de senha;
  - dashboard;
  - uploads/importacoes TSE;
  - mapas eleitorais;
  - inteligencia politica;
  - campanhas;
  - configuracoes/equipe.

### Autenticacao

- Supabase Auth integrado.
- Rotas protegidas por middleware.
- Criacao automatica de workspace/organizacao/campanha ao acessar o sistema.
- Estrutura multi-tenant inicial criada com organizacoes, campanhas e membros.

### Banco De Dados

- Prisma configurado.
- Supabase/PostgreSQL conectado.
- Migrations aplicadas no Supabase.
- Setup SQL aplicado com:
  - extensoes;
  - RLS;
  - policies;
  - trigger/base de usuario;
  - bucket `electoral-uploads`.

### Pipeline Eleitoral

- Scripts base criados para:
  - importar CSV TSE em streaming;
  - normalizar municipios;
  - normalizar zonas;
  - normalizar secoes;
  - normalizar candidatos;
  - normalizar partidos;
  - reconstruir agregacoes analiticas.

Arquivo real encontrado:

```text
D:\Votação\votacao_secao_2022_PR.csv
```

Tamanho aproximado:

```text
1.08 GB
```

### Mapas

- Mapbox GL JS integrado.
- Fallback criado para OpenStreetMap.
- Mapbox deixou de ser obrigatorio.
- O mapa base agora carrega sem precisar criar conta/cartao no Mapbox.
- Estado vazio correto implementado quando nao ha geometrias reais.

### Deploy

- Repositorio enviado ao GitHub.
- Projeto conectado na Vercel.
- Variaveis do Supabase configuradas na Vercel.
- Erro de `outputDirectory` na Vercel corrigido.
- Deploy de producao funcionando.

## Correcoes Ja Realizadas

### 1. Deploy Que Dava 404

Problema:

- A Vercel estava marcando o deploy como `READY`, mas a URL abria `404`.
- O projeto estava com `outputDirectory` configurado de forma errada.

Correcao:

- Ajustado `outputDirectory` para configuracao correta de projeto Next.js.
- Novo deploy publicado.
- URL passou a responder `200`.

### 2. Mapbox Bloqueando O Uso

Problema:

- O app exigia `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.
- Sem token, a tela de mapas nao carregava mapa real.
- Usuario nao queria criar conta/cartao no Mapbox neste momento.

Correcao:

- Implementado fallback com OpenStreetMap.
- Se houver token Mapbox, usa Mapbox.
- Se nao houver token, usa OpenStreetMap.
- As camadas eleitorais continuam dependendo de dados reais do banco.

Arquivo alterado:

```text
src/features/maps/components/electoral-map-client.tsx
```

### 3. Tela De Upload Quebrando No Cliente

Problema:

- Ao clicar em importar CSV, apareceu erro:

```text
Application error: a client-side exception has occurred
```

Causa provavel:

- O client component de upload estava usando validacao de ambiente completa via `getEnv()`.
- No navegador, variaveis privadas como `DATABASE_URL`, `DIRECT_URL` e `SUPABASE_SERVICE_ROLE_KEY` nao existem.
- Isso podia derrubar a hidratacao da tela.

Correcao:

- `src/lib/supabase/client.ts` passou a ler apenas:
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Arquivo alterado:

```text
src/lib/supabase/client.ts
```

### 4. Lentidao Ao Navegar

Problema:

- O site parecia muito lento.
- O menu lateral pre-carregava varias rotas protegidas automaticamente.
- Cada rota protegida podia bater no Supabase/Postgres.
- Isso gerava varias consultas antes mesmo do usuario clicar.

Correcao:

- Desativado `prefetch` nos links internos pesados do app shell.

Arquivo alterado:

```text
src/components/app/app-shell.tsx
```

## Onde Estamos Travados

### 1. O Mapa Ainda Nao Tem Geometrias Reais No Banco

Na tela de mapas aparece:

```text
0 geometrias
Sem geometrias reais para este recorte
```

Isso nao e bug visual. Significa que o PostGIS ainda nao tem:

- poligonos de municipios;
- poligonos de bairros;
- zonas eleitorais georreferenciadas;
- secoes/local de votacao com ponto ou geometria.

O mapa base aparece, mas nao ha dados territoriais para desenhar por cima.

### 2. O CSV Do TSE Existe, Mas Ainda Nao Foi Processado

O CSV real esta localmente em:

```text
D:\Votação\votacao_secao_2022_PR.csv
```

Mas ele ainda nao foi importado para o banco de producao.

O importador foi refatorado para aceitar `campaign-id` e criar `electoral_uploads` automaticamente. O modo antigo com `upload-id` continua disponivel para reprocessar um upload existente.

```powershell
npm run import:tse -- --file "D:\Votação\votacao_secao_2022_PR.csv" --campaign-id "<campaign-id>" --rebuild-analytics true
```

### 3. Upload Pelo Navegador Nao E O Melhor Caminho Para 1 GB

O arquivo TSE tem mais de 1 GB. Subir isso pelo navegador para Supabase Storage pode ser lento, instavel e ruim para teste inicial.

Melhor caminho:

- processar localmente com script streaming;
- inserir no Supabase/Postgres em batches;
- registrar progresso no banco;
- depois rebuildar agregacoes.

### 4. Faltam Fontes Geograficas Baixadas E Convertidas

Precisamos obter e preparar:

- malha municipal do PR/RMC pelo IBGE;
- bairros de Curitiba pelo IPPUC;
- bairros de Sao Jose dos Pinhais por fonte municipal ou OSM confiavel;
- se possivel, locais de votacao/zona eleitoral com coordenadas.

Sem essas geometrias, mapas, heatmaps e analises territoriais nao ficam utilizaveis.

### 5. Os Dashboards Ainda Estao Sem Dados Operacionais

As telas existem, mas os cards e listas dependem de:

- votos importados;
- candidatos normalizados;
- partidos normalizados;
- municipios/zones/secoes populados;
- agregacoes territoriais reconstruidas.

Hoje a experiencia e mais de navegacao estrutural do que uso real de campanha.

## O Que Precisa Ser Feito Para Deixar Utilizavel

## Fase 1 - Corrigir Fluxo De Importacao Local Do CSV

Objetivo:

Permitir processar diretamente:

```text
D:\Votação\votacao_secao_2022_PR.csv
```

sem depender de upload web.

Implementar:

- novo argumento `--campaign-id` - concluido;
- compatibilidade com `--upload-id` - mantida;
- criacao automatica de `electoral_uploads` - concluida;
- status do upload - concluido:
  - `UPLOADED`;
  - `PROCESSING`;
  - `COMPLETED`;
  - `FAILED`;
- progresso por linhas processadas - concluido;
- contagem de linhas com erro - concluido;
- logs objetivos no terminal - concluido.

Comando desejado:

```powershell
npm run import:tse -- --file "D:\Votação\votacao_secao_2022_PR.csv" --campaign-id "<campaign-id>" --rebuild-analytics true
```

Resultado esperado:

- municipios criados/atualizados;
- zonas criadas/atualizadas;
- secoes criadas/atualizadas;
- candidatos criados/atualizados;
- partidos criados/atualizados;
- votos inseridos;
- agregacoes reconstruidas.

## Fase 2 - Importar Geometrias Reais

Objetivo:

Fazer o mapa mostrar territorios reais.

### Municipios

Fonte recomendada:

- IBGE Malha Municipal.

Processo:

- baixar SHP do Parana;
- converter para GeoJSON;
- importar apenas PR/RMC inicialmente;
- salvar em `municipalities.boundary` e `municipalities.centroid`.

Comando esperado:

```powershell
npm run import:geo -- --layer municipalities --file "D:\Votação\geo\municipios_pr.geojson" --name-prop "NM_MUN" --ibge-code-prop "CD_MUN" --source ibge
```

### Bairros De Curitiba

Fonte recomendada:

- IPPUC / Prefeitura de Curitiba.

Processo:

- baixar Divisa de Bairros;
- converter SHP para GeoJSON;
- importar como `neighborhoods`;
- vincular ao municipio Curitiba.

Comando esperado:

```powershell
npm run import:geo -- --layer neighborhoods --file "D:\Votação\geo\bairros_curitiba.geojson" --name-prop "NOME" --municipality-name-prop "MUNICIPIO" --source ippuc
```

### Bairros De Sao Jose Dos Pinhais

Fonte preferencial:

- portal oficial municipal, se houver base aberta.

Alternativa:

- OpenStreetMap/Overpass, validando nomes e limites.

Processo:

- baixar/converter GeoJSON;
- importar como `neighborhoods`;
- vincular ao municipio Sao Jose dos Pinhais.

### Secoes E Locais De Votacao

Objetivo:

- ter pontos reais para secoes/locais;
- permitir mapas por zona/secao.

Processo:

- usar campos do CSV TSE:
  - municipio;
  - zona;
  - secao;
  - local de votacao;
  - endereco;
  - bairro, se existir;
- geocodificar enderecos quando nao houver coordenada;
- salvar `latitude`, `longitude` e `geom` em `electoral_sections`;
- associar secao ao bairro por `ST_Contains`.

## Fase 3 - Rebuild Analitico

Depois de importar CSV e geometrias, rodar rebuild:

```powershell
npm run analytics:rebuild -- --upload-id "<upload-id>"
```

Ou adaptar para:

```powershell
npm run analytics:rebuild -- --campaign-id "<campaign-id>"
```

Resultado esperado:

- `territorial_vote_summaries` preenchida;
- mapas com votos agregados;
- dashboards com totais reais;
- rankings e filtros funcionando.

## Fase 4 - Tornar Upload/Importacao Operacional Na UI

Hoje a tela de upload registra arquivo, mas o processamento real ainda depende de script.

Para ficar utilizavel:

- mostrar claramente que arquivo gigante deve ser processado por worker;
- exibir status real vindo do banco;
- botao para iniciar processamento quando estiver em ambiente adequado;
- endpoint seguro para disparar job;
- logs resumidos por upload;
- tela de erros de importacao.

Importante:

Em Vercel serverless, processar CSV de 1 GB dentro de uma request HTTP nao e adequado. O ideal e:

- worker local;
- job externo;
- Supabase Edge Function apenas para tarefas pequenas;
- fila/servico dedicado no futuro.

## Fase 5 - Melhorar Performance Real

Para o sistema ficar bom de usar:

- reduzir chamadas duplicadas no layout;
- cachear snapshot de workspace;
- cachear filtros analiticos;
- paginar uploads;
- usar views/materialized views para dashboards;
- usar indices PostGIS;
- servir mapas por tiles quando houver grande volume;
- evitar carregar Mapbox/OSM ate entrar na rota de mapas;
- manter prefetch desligado em rotas pesadas.

## Checklist Para Produto Utilizavel

- [x] Ajustar importador para aceitar `--campaign-id`.
- [x] Criar upload automaticamente no importador local.
- [ ] Processar `D:\Votação\votacao_secao_2022_PR.csv`.
- [ ] Baixar malha municipal PR/RMC do IBGE.
- [ ] Converter SHP para GeoJSON.
- [ ] Importar municipios no PostGIS.
- [ ] Baixar bairros de Curitiba do IPPUC.
- [ ] Converter e importar bairros de Curitiba.
- [ ] Obter bairros de Sao Jose dos Pinhais.
- [ ] Converter e importar bairros de Sao Jose dos Pinhais.
- [ ] Geocodificar secoes/locais de votacao.
- [ ] Associar secoes a bairros por PostGIS.
- [ ] Rodar rebuild analitico.
- [ ] Validar `/dashboard` com numeros reais.
- [ ] Validar `/maps` com geometrias reais.
- [ ] Validar filtros por municipio, zona, bairro, candidato e partido.
- [ ] Validar upload/status na UI.
- [ ] Validar performance depois dos dados reais.

## Diagnostico Honesto

O projeto nao esta pronto para uso operacional ainda.

Ele esta em uma fase de fundacao tecnica com deploy funcionando, autenticacao funcionando e estrutura de produto criada. O bloqueio principal e a carga de dados reais.

Para ficar utilizavel, o proximo trabalho nao deve ser criar mais telas. Deve ser:

1. importar dados reais;
2. importar geometrias reais;
3. ligar votos a territorios;
4. rebuildar agregacoes;
5. validar performance com dados reais.

Depois disso, as telas passam a ter utilidade real para campanha.
