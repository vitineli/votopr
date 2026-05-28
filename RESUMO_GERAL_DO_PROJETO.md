# Resumo Geral Do Projeto

## Visao Geral

O projeto `VotoPR` ja tem uma base SaaS funcional e bem estruturada para inteligencia eleitoral territorial no Parana, com foco inicial em:

- Curitiba
- Sao Jose dos Pinhais
- Regiao Metropolitana de Curitiba

A fundacao do produto foi montada com:

- Next.js 15 App Router
- TypeScript
- TailwindCSS
- Supabase Auth + Storage
- PostgreSQL + PostGIS
- Prisma ORM
- Zod
- React Query
- Zustand
- Mapbox GL JS

## O Que Ja Foi Implementado

### 1. Fundacao SaaS

Ja existe estrutura profissional para:

- autenticacao com Supabase
- multi-tenant por organizacao
- campanhas
- protecao de rotas
- dashboard base
- uploads de CSV
- app shell com navegacao

Areas principais da estrutura:

- `src/app`
- `src/components`
- `src/features`
- `src/lib`
- `src/repositories`
- `src/services`
- `prisma`
- `supabase`
- `scripts`

### 2. Banco De Dados E Modelagem

Ja existe modelagem relacional e geoespacial para:

- `users`
- `organizations`
- `organization_members`
- `campaigns`
- `electoral_uploads`
- `municipalities`
- `electoral_zones`
- `electoral_sections`
- `electoral_offices`
- `parties`
- `candidates`
- `electoral_data`
- `neighborhoods`
- `territorial_regions`
- `electoral_import_errors`
- `territorial_vote_summaries`
- `political_leaders`
- `political_supporters`
- `field_visits`
- `political_events`
- `political_demands`
- `operation_plans`
- `operation_plan_allocations`
- `strategic_insights`

As migrations existentes hoje sao:

- [0001_foundation](C:/Users/Vinicius/Documents/eleiçoes/prisma/migrations/0001_foundation/migration.sql)
- [0002_electoral_pipeline](C:/Users/Vinicius/Documents/eleiçoes/prisma/migrations/0002_electoral_pipeline/migration.sql)
- [0003_map_performance_indexes](C:/Users/Vinicius/Documents/eleiçoes/prisma/migrations/0003_map_performance_indexes/migration.sql)

- [0004_political_intelligence](C:/Users/Vinicius/Documents/eleiÃ§oes/prisma/migrations/0004_political_intelligence/migration.sql)

### 3. Pipeline Eleitoral TSE

Ja foi implementado um pipeline real para CSVs grandes do TSE:

- deteccao de encoding, delimitador e colunas
- validacao estrutural
- streaming
- processamento em chunks
- normalizacao de entidades
- insert em lote
- registro de erros de importacao
- rebuild de agregacoes analiticas

Scripts principais:

- [import-tse-csv.ts](C:/Users/Vinicius/Documents/eleiçoes/scripts/import-tse-csv.ts)
- [rebuild-analytics.ts](C:/Users/Vinicius/Documents/eleiçoes/scripts/rebuild-analytics.ts)
- [seed-pr-territories.ts](C:/Users/Vinicius/Documents/eleiçoes/scripts/seed-pr-territories.ts)

O CSV real analisado do TSE em `D:\Votação` foi identificado como:

- encoding `latin1`
- delimitador `;`
- 26 colunas
- sem colunas obrigatorias ausentes

### 4. Georreferenciamento

Ja existe suporte real para ingestao de geometrias:

- municipios via IBGE
- bairros via OSM ou bases oficiais
- pontos de secoes e locais
- associacao espacial com PostGIS

Script principal:

- [import-geographies.ts](C:/Users/Vinicius/Documents/eleiçoes/scripts/import-geographies.ts)

Importante:

- o sistema foi desenhado para nao inventar geometria
- sem GeoJSON real, o sistema mostra estado vazio operacional
- nao foram usados mocks de mapa

### 5. APIs Analiticas

Ja existem APIs protegidas para analytics:

- [filters](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/analytics/filters/route.ts)
- [stats](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/analytics/stats/route.ts)
- [search](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/analytics/search/route.ts)
- [compare](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/analytics/compare/route.ts)

Essas APIs ja suportam:

- filtros territoriais
- busca
- agregacoes
- comparacao territorial
- validacao de acesso por organizacao e campanha
- rate limiting

### 6. Sistema De Mapas

Ja foi implementada a primeira versao real do sistema de mapas:

- rota `/maps`
- interface premium inspirada em analytics geoespacial
- mapa com Mapbox GL JS
- modos de visualizacao:
  - `Heatmap`
  - `Territorios`
  - `Clusters`
  - `Comparar`
- inspector territorial
- filtros em tempo real
- serie historica territorial
- suporte a tiles vetoriais com `ST_AsMVT`

Arquivos principais:

- [maps/page.tsx](C:/Users/Vinicius/Documents/eleiçoes/src/app/(app)/maps/page.tsx)
- [electoral-map-client.tsx](C:/Users/Vinicius/Documents/eleiçoes/src/features/maps/components/electoral-map-client.tsx)
- [electoral-map-loader.tsx](C:/Users/Vinicius/Documents/eleiçoes/src/features/maps/components/electoral-map-loader.tsx)
- [map-repository.ts](C:/Users/Vinicius/Documents/eleiçoes/src/repositories/maps/map-repository.ts)
- [geojson route](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/maps/geojson/route.ts)
- [timeseries route](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/maps/timeseries/route.ts)
- [tiles route](C:/Users/Vinicius/Documents/eleiçoes/src/app/api/maps/tiles/[level]/[z]/[x]/[y]/route.ts)

### 7. Inteligencia Politica E Estrategica

Foi implementado o modulo operacional para campanhas reais:

- rota `/intelligence`
- score territorial por municipio, bairro, zona e secao
- calculo de potencial eleitoral, dificuldade, concorrencia, oportunidade e crescimento possivel
- deteccao de areas negligenciadas, votos orfaos, baixa concorrencia e riscos territoriais
- geracao de plano de rua com distribuicao de cabos eleitorais, carros, verba e votos esperados
- CRM politico para liderancas, apoiadores, visitas, eventos e demandas
- painel executivo com KPIs, ranking territorial e insights estrategicos

Arquivos principais:

- [intelligence/page.tsx](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/(app)/intelligence/page.tsx)
- [political-intelligence-client.tsx](C:/Users/Vinicius/Documents/eleiÃ§oes/src/features/intelligence/components/political-intelligence-client.tsx)
- [use-intelligence-data.ts](C:/Users/Vinicius/Documents/eleiÃ§oes/src/features/intelligence/hooks/use-intelligence-data.ts)
- [intelligence-repository.ts](C:/Users/Vinicius/Documents/eleiÃ§oes/src/repositories/intelligence/intelligence-repository.ts)
- [crm-repository.ts](C:/Users/Vinicius/Documents/eleiÃ§oes/src/repositories/crm/crm-repository.ts)
- [scoring.ts](C:/Users/Vinicius/Documents/eleiÃ§oes/src/services/intelligence/scoring.ts)
- [insights.ts](C:/Users/Vinicius/Documents/eleiÃ§oes/src/services/intelligence/insights.ts)

APIs principais:

- [overview](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/intelligence/overview/route.ts)
- [operation-plan](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/intelligence/operation-plan/route.ts)
- [crm](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/route.ts)
- [leaders](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/leaders/route.ts)
- [supporters](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/supporters/route.ts)
- [visits](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/visits/route.ts)
- [events](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/events/route.ts)
- [demands](C:/Users/Vinicius/Documents/eleiÃ§oes/src/app/api/crm/demands/route.ts)

## O Que Ja Foi Validado

Ja foram executados com sucesso:

- `npm run db:generate`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm audit --audit-level=moderate`

Tambem foi ajustado o script `dev` para usar `next dev` sem Turbopack, porque o caminho local com acento estava causando panic no ambiente de desenvolvimento.

## Dependencias E Configuracoes Necessarias

Para o sistema funcionar por completo localmente ou em producao, ainda dependemos de configuracao real de ambiente:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`

Tambem e necessario:

- aplicar as migrations no banco
- executar o `supabase/setup.sql`
- subir geometrias reais no PostGIS

## Estado Atual Real

Hoje o projeto esta em um ponto em que:

- a base SaaS esta pronta
- o pipeline TSE esta pronto
- a modelagem territorial esta pronta
- as APIs de analytics estao prontas
- a estrutura do mapa esta pronta
- o modulo de inteligencia politica e operacao de rua esta pronto

O que ainda pode impedir a experiencia completa nao e falta de codigo base, e sim falta de dados/configuracao reais em alguns ambientes:

- credenciais do Supabase
- token do Mapbox
- GeoJSON real importado
- dados eleitorais efetivamente carregados no banco

## Proximos Passos Naturais

As continuacoes mais logicas agora seriam:

1. configurar ambiente real completo
2. importar geometrias reais prioritarias de Curitiba, Sao Jose dos Pinhais e RMC
3. importar CSVs reais do TSE no banco
4. validar o mapa com dados reais
5. validar o modulo de inteligencia politica com campanha real e candidato-alvo
6. evoluir UX de filtros, comparacao, historico e rotinas de campo

## Referencias Rapidas

Documentacao principal do projeto:

- [README.md](C:/Users/Vinicius/Documents/eleiçoes/README.md)

Schema do banco:

- [schema.prisma](C:/Users/Vinicius/Documents/eleiçoes/prisma/schema.prisma)

Setup Supabase:

- [setup.sql](C:/Users/Vinicius/Documents/eleiçoes/supabase/setup.sql)

Variaveis de ambiente:

- [.env.example](C:/Users/Vinicius/Documents/eleiçoes/.env.example)
