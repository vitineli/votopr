# Checklist De Producao

## 1. Ambiente

- Preencher [`.env.example`](C:/Users/Vinicius/Documents/eleições/.env.example) em `.env.local` e na Vercel.
- Confirmar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.
- Definir `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.
- Manter `IMPORT_TARGET_STATE=PR`.

## 2. Banco E Supabase

- Habilitar extensoes `postgis`, `pgcrypto`, `citext`.
- Executar `npm run db:deploy`.
- Executar [setup.sql](C:/Users/Vinicius/Documents/eleições/supabase/setup.sql).
- Validar RLS para organizacoes, uploads, analytics, CRM e inteligencia politica.
- Criar bucket privado `electoral-uploads`.

## 3. Dados Reais

- Importar municipios do PR.
- Importar bairros reais de Curitiba, Sao Jose dos Pinhais e RMC.
- Importar zonas e secoes com geometrias ou pontos reais.
- Importar CSVs reais do TSE.
- Rodar `npm run analytics:rebuild -- --upload-id "<uuid>"` quando necessario.

## 4. Validacao Tecnica

- Rodar `npm run db:generate`.
- Rodar `npm run typecheck`.
- Rodar `npm run lint`.
- Rodar `npm run build`.
- Validar login, logout, reset de senha e criacao automatica de workspace.
- Validar `/dashboard`, `/maps`, `/intelligence`, `/uploads`, `/campaigns`, `/settings`.
- Validar APIs autenticadas com organizacao real.

## 5. Performance

- Confirmar pooler ativo no `DATABASE_URL`.
- Usar `DIRECT_URL` apenas para migrations e jobs.
- Monitorar queries mais pesadas de `territorial_vote_summaries`.
- Garantir importacao em batches para CSVs grandes.
- Validar tamanho e qualidade das geometrias antes de subir para PostGIS.

## 6. Deploy Vercel

- Criar projeto e conectar repositorio.
- Configurar variaveis de ambiente em Preview e Production.
- Fazer primeiro deploy com `npm run build` ja validado localmente.
- Confirmar rotas dinâmicas autenticadas e APIs privadas funcionando apos deploy.
- Verificar dominio, HTTPS e redirecionamentos de auth do Supabase.

## 7. Operacao

- Criar pelo menos uma organizacao e campanha real.
- Vincular candidato-alvo e importar dados da eleicao principal.
- Preencher CRM com liderancas, apoiadores, visitas, eventos e demandas.
- Gerar plano operacional em `/intelligence`.
- Revisar mapa, scores territoriais e insights antes de uso em campo.
