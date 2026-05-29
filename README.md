# VotoPR

SaaS de inteligencia eleitoral territorial focado inicialmente no Parana, com prioridade para Curitiba, Sao Jose dos Pinhais e Regiao Metropolitana de Curitiba.

## Stack

- Next.js 15 App Router
- TypeScript
- TailwindCSS
- shadcn/ui-style components
- Supabase Auth + Storage
- PostgreSQL + PostGIS
- Prisma ORM
- Zod
- React Query
- Zustand

## Escopo Atual

Esta base entrega autenticacao, multi-tenant, campanhas, upload de CSV TSE, pipeline eleitoral streaming, normalizacao, tabelas analiticas, APIs protegidas, schema geoespacial com PostGIS, mapas eleitorais e modulo operacional de inteligencia politica.

O escopo continua PR-first: Curitiba, Sao Jose dos Pinhais e Regiao Metropolitana de Curitiba sao as prioridades de modelagem, performance e UX.

## Setup Local

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run seed:pr
npm run dev
```

No Supabase, execute `supabase/setup.sql` depois das migrations. Esse SQL cria trigger de sincronizacao com Supabase Auth, politicas RLS e bucket privado para CSVs.

Scripts principais:

```bash
npm run dev
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run import:tse -- --file "D:\Votacao\arquivo.csv" --upload-id "<uuid>"
npm run import:geo -- --layer neighborhoods --file ".\dados\bairros.geojson"
npm run analytics:rebuild -- --upload-id "<uuid>"
```

## Pipeline CSV TSE

O worker em `scripts/import-tse-csv.ts` foi desenhado para arquivos grandes:

- detecta delimitador, encoding e colunas por amostragem;
- valida estrutura obrigatoria do TSE;
- processa por streaming sem carregar o arquivo inteiro em memoria;
- normaliza municipios, cargos, partidos quando presentes, candidatos, zonas, secoes e bairros quando presentes;
- usa inserts/upserts em lote via SQL set-based;
- grava amostra de erros de validacao em `electoral_import_errors`;
- reconstrui `territorial_vote_summaries` ao final para APIs rapidas.

```bash
npm run import:tse -- --file "D:\Votacao\votacao_secao_2022_PR.csv" --upload-id "<uuid-do-upload>"
```

Opcoes uteis:

```bash
npm run import:tse -- --file "D:\Votacao\votacao_secao_2022_PR.csv" --upload-id "<uuid>" --batch-size 20000
npm run import:tse -- --file "D:\Votacao\votacao_secao_2022_PR.csv" --upload-id "<uuid>" --rebuild-analytics false
npm run analytics:rebuild -- --upload-id "<uuid>"
```

## Georreferenciamento

O sistema nao inventa coordenadas. Geometrias reais entram por GeoJSON e sao persistidas em PostGIS.

Importar limites municipais do IBGE:

```bash
npm run import:geo -- --layer municipalities --file ".\dados\municipios-pr.geojson" --name-prop "NM_MUN" --ibge-code-prop "CD_MUN" --source "ibge"
```

Importar bairros reais de Curitiba/Sao Jose dos Pinhais/OSM:

```bash
npm run import:geo -- --layer neighborhoods --file ".\dados\bairros-curitiba.geojson" --name-prop "name" --municipality-name-prop "municipality" --source "osm" --assign-sections
```

Importar pontos reais de locais/secoes:

```bash
npm run import:geo -- --layer section-points --file ".\dados\secoes.geojson" --tse-code-prop "CD_MUNICIPIO" --zone-prop "NR_ZONA" --section-prop "NR_SECAO" --assign-sections
```

Com pontos e poligonos carregados, `--assign-sections` associa secoes a bairros/regioes via `ST_Contains`.

## Tabelas Principais

- `electoral_data`: fato granular importado do TSE por secao, cargo e votavel.
- `municipalities`, `electoral_zones`, `electoral_sections`: territorio eleitoral PR-first.
- `electoral_offices`, `parties`, `candidates`: dimensoes normalizadas.
- `neighborhoods`, `territorial_regions`: bairros e regioes com geometrias reais.
- `territorial_vote_summaries`: agregacoes prontas para dashboards, filtros, comparacoes, mapas e inteligencia politica.
- `electoral_import_errors`: amostra auditavel de linhas rejeitadas.
- `political_leaders`, `political_supporters`: CRM politico territorial.
- `field_visits`, `political_events`, `political_demands`: operacao de rua e acompanhamento de demandas.
- `operation_plans`, `operation_plan_allocations`: distribuicao calculada de equipe, carros e verba.
- `strategic_insights`: recomendacoes e alertas territoriais persistiveis.

## APIs Analiticas

Todas exigem usuario autenticado, validam organizacao/campanha e aplicam rate limiting.

```text
GET /api/analytics/filters?campaignId=<uuid>
GET /api/analytics/stats?campaignId=<uuid>&territoryLevel=MUNICIPALITY&limit=100
GET /api/analytics/search?campaignId=<uuid>&type=candidate&q=nome
GET /api/analytics/compare?campaignId=<uuid>&territoryLevel=MUNICIPALITY&leftId=<uuid>&rightId=<uuid>
```

`territoryLevel` aceita `STATE`, `METROPOLITAN_REGION`, `MUNICIPALITY`, `NEIGHBORHOOD`, `ZONE` e `SECTION`.

## Sistema De Mapas

A rota `/maps` entrega o cockpit geoespacial profissional com Mapbox GL JS:

- modos `Heatmap`, `Territorios`, `Clusters` e `Comparar`;
- filtros por cargo, candidato, partido, municipio, bairro e zona eleitoral;
- inspector territorial com votos, share, potencial, candidato dominante, comparacao e historico;
- carregamento lazy do mapa para manter o bundle inicial leve;
- fallback automatico com OpenStreetMap quando nao houver token do Mapbox;
- estado vazio operacional quando ainda nao existem geometrias reais no PostGIS.

O token publico do Mapbox e opcional. Sem ele, o sistema usa OpenStreetMap como mapa base e mantem as camadas eleitorais reais por cima:

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
```

APIs de mapa:

```text
GET /api/maps/geojson?campaignId=<uuid>&level=MUNICIPALITY
GET /api/maps/timeseries?campaignId=<uuid>&territoryLevel=MUNICIPALITY&territoryId=<uuid>
GET /api/maps/tiles/MUNICIPALITY/{z}/{x}/{y}?campaignId=<uuid>
```

`level` aceita `MUNICIPALITY`, `NEIGHBORHOOD`, `ZONE` e `SECTION`. O endpoint GeoJSON prioriza interacao e tooltips; o endpoint MVT (`ST_AsMVT`) prepara escala para tiles vetoriais otimizados.

## Inteligencia Politica

A rota `/intelligence` transforma dados eleitorais e CRM em decisao operacional de campanha:

- score territorial por municipio, bairro, zona e secao;
- potencial eleitoral, dificuldade, concorrencia, oportunidade e crescimento possivel;
- deteccao de areas negligenciadas, votos orfaos, baixa concorrencia e risco de perda territorial;
- geracao de plano de rua com distribuicao de cabos eleitorais, carros e orcamento por custo-beneficio politico;
- CRM politico para liderancas, apoiadores, visitas, eventos e demandas;
- painel executivo com KPIs, ranking territorial e recomendacoes estrategicas.

APIs principais:

```text
GET /api/intelligence/overview?campaignId=<uuid>&territoryLevel=NEIGHBORHOOD
GET /api/intelligence/operation-plan?campaignId=<uuid>
POST /api/intelligence/operation-plan
GET /api/crm?campaignId=<uuid>
POST /api/crm/leaders
POST /api/crm/supporters
POST /api/crm/visits
POST /api/crm/events
POST /api/crm/demands
```

## Arquitetura

```text
src/app              Rotas App Router, APIs e layouts
src/components       UI compartilhada e app shell
src/features         Fluxos de produto por dominio
src/hooks            Hooks client-side
src/lib              Infra, Supabase, Prisma, env, auth
src/repositories     Acesso a dados server-side
src/services         Regras de aplicacao, pipeline, analytics e seguranca
src/types            Tipos compartilhados
prisma               Schema e migrations
supabase             SQL de RLS, storage e setup Auth
scripts              Importacao TSE, geografia, analytics e seeds
```

## Performance

- Worker fora de request HTTP para evitar timeout serverless.
- Batch padrao de 20.000 linhas.
- Upserts set-based via `jsonb_to_recordset`.
- Indices compostos por campanha, territorio, cargo e candidato.
- GiST em geometrias PostGIS.
- Tabela `territorial_vote_summaries` evita agregacoes pesadas em tempo de tela.

## Deploy Vercel

1. Criar projeto Supabase com Postgres + PostGIS.
2. Configurar `DATABASE_URL` com pooler e `DIRECT_URL` direto.
3. Executar `npm run db:deploy`.
4. Executar `supabase/setup.sql`.
5. Configurar variaveis na Vercel.
6. Deploy:

```bash
vercel
vercel --prod
```

Checklist operacional final:

- [PRODUCAO_CHECKLIST.md](C:/Users/Vinicius/Documents/eleições/PRODUCAO_CHECKLIST.md)

## Decisoes De Produto

- O MVP e Parana-first, nao Brasil-first.
- Curitiba, Sao Jose dos Pinhais e RMC sao prioridade de modelagem e performance.
- A lista inicial da RMC segue a AMEP/PR: 29 municipios.
- Geometrias devem vir de bases reais como IBGE, OSM ou bases municipais oficiais.
- Mapas, inteligencia politica e operacao de rua consomem as agregacoes reais do pipeline, sem mocks territoriais.
