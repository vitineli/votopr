# VotoPR - Base territorial oficial e estrategia GIS eleitoral

Data: 2026-05-29

## Diagnostico executivo

O VotoPR agora possui importador oficial para bairros de Curitiba e Sao Jose dos Pinhais usando servicos ArcGIS REST municipais. As geometrias foram importadas como `MultiPolygon` em `SRID 4326` no PostGIS, com validacao por `ST_MakeValid`, `ST_IsValid`, area positiva, slug e metadados de fonte.

Status atual no banco:

- Curitiba: 75 bairros oficiais com geometria.
- Sao Jose dos Pinhais: 42 bairros oficiais com geometria.
- Zonas eleitorais: sem poligonos oficiais carregados.
- Secoes/locais de votacao: sem coordenadas no CSV `votacao_secao_2022_PR.csv`.
- Voto por bairro: operacional de forma parcial e auditavel por correspondencia textual de nomes oficiais no texto TSE. Cobertura completa depende de geocodificacao dos locais de votacao.

Conclusao: a base de bairros esta correta. Ja existe primeira vinculacao por texto oficial, mas a proxima etapa tecnica continua sendo geocodificar locais de votacao ou obter base oficial de locais com coordenadas para relacionar votos com bairros via `ST_Contains`.

## Fontes oficiais validadas

### Curitiba

Fonte: IPPUC / GeoCuritiba.

Endpoint:

```txt
https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44
```

Evidencias tecnicas:

- Layer `Bairro`.
- Tipo `Feature Layer`.
- Geometria `esriGeometryPolygon`.
- CRS nativo `EPSG:31982`.
- Suporte de query em `geoJSON`.
- Campo de nome oficial: `nome`.
- Campo de codigo: `codigo`.

Consulta GeoJSON usada:

```txt
https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326
```

Referencia: https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44?f=pjson

### Sao Jose dos Pinhais

Fonte: GeoSJP / Prefeitura Municipal de Sao Jose dos Pinhais.

Endpoint:

```txt
https://geo.sjp.pr.gov.br/server/rest/services/Bairros/Bairros/MapServer/1
```

Evidencias tecnicas obtidas por ArcGIS REST:

- Pasta oficial `Bairros`.
- Servico `Bairros/Bairros`.
- Layer `Bairros`.
- Tipo `Feature Layer`.
- Geometria `esriGeometryPolygon`.
- CRS nativo Web Mercator `EPSG:3857`.
- Query exportada com `outSR=4326`.
- Campo de nome oficial: `bairro2015`.
- Campo de codigo: `objectid`.

Consulta GeoJSON usada:

```txt
https://geo.sjp.pr.gov.br/server/rest/services/Bairros/Bairros/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&outSR=4326
```

Referencia: https://geo.sjp.pr.gov.br/server/rest/services/Bairros/Bairros/MapServer/1?f=pjson

## Modelo PostGIS adotado

O projeto ja possuia a tabela `neighborhoods`. Para evitar tabela paralela e quebra de relacionamentos, a modelagem foi estendida:

```sql
ALTER TABLE neighborhoods
  ADD COLUMN slug text,
  ADD COLUMN official_code text,
  ADD COLUMN source_url text,
  ADD COLUMN imported_at timestamptz;

CREATE UNIQUE INDEX neighborhoods_municipality_slug_key
  ON neighborhoods(municipality_id, slug);

CREATE INDEX neighborhoods_slug_idx
  ON neighborhoods(slug);

CREATE INDEX neighborhoods_name_trgm_idx
  ON neighborhoods USING gin(name gin_trgm_ops);

CREATE INDEX neighborhoods_boundary_not_null_gix
  ON neighborhoods USING gist(boundary)
  WHERE boundary IS NOT NULL;
```

Campo equivalente ao requisito `geometry geometry(MultiPolygon, 4326)`:

```txt
neighborhoods.boundary geometry(MultiPolygon, 4326)
```

Campo `city` e derivado por relacionamento:

```txt
neighborhoods.municipality_id -> municipalities.name
```

## Scripts implementados

Arquivo:

```txt
scripts/import-official-neighborhoods.ts
```

Comando Curitiba:

```bash
npm run import:neighborhoods:official -- \
  --city curitiba \
  --assign-sections \
  --rebuild-campaign-id 3c70bf35-b116-4e9e-a80a-8f6d54645042
```

Comando Sao Jose dos Pinhais:

```bash
npm run import:neighborhoods:official -- \
  --city sao-jose-dos-pinhais \
  --assign-sections \
  --rebuild-campaign-id 3c70bf35-b116-4e9e-a80a-8f6d54645042
```

Dry-run:

```bash
npm run import:neighborhoods:official -- --city curitiba --dry-run
npm run import:neighborhoods:official -- --city sao-jose-dos-pinhais --dry-run
```

Fonte customizada:

```bash
npm run import:neighborhoods:official -- \
  --city sao-jose-dos-pinhais \
  --url "https://fonte-oficial/MapServer/1" \
  --name-prop "bairro2015" \
  --code-prop "objectid"
```

## Validacoes GIS aplicadas

Cada feicao passa por:

```sql
ST_SetSRID(ST_GeomFromGeoJSON($geojson), 4326)
ST_MakeValid(...)
ST_CollectionExtract(..., 3)
ST_Multi(...)
ST_IsValid(...)
ST_IsEmpty(...)
ST_Area(geography(...)) > 0
ST_PointOnSurface(...)
```

O importador rejeita geometria vazia, invalida ou sem area.

## Por que voto por bairro ainda nao aparece

O CSV real importado possui estas colunas principais para local de votacao:

```txt
NR_LOCAL_VOTACAO
NM_LOCAL_VOTACAO
DS_LOCAL_VOTACAO_ENDERECO
```

Ele nao trouxe:

```txt
NM_BAIRRO
DS_BAIRRO
LATITUDE
LONGITUDE
NR_LATITUDE
NR_LONGITUDE
```

Resultado atual:

- As secoes existem.
- Os locais de votacao existem.
- Os bairros oficiais existem.
- Mas as secoes nao tem ponto geografico (`geom`) nem `neighborhood_id`.

Sem coordenada real ou bairro oficial da secao, nao se deve forcar associacao por aproximacao textual ampla. O projeto usa apenas uma primeira vinculacao conservadora: quando o nome oficial do bairro aparece de forma textual e nao ambigua no nome/endereco do local de votacao do TSE.

Resultado parcial atual:

- Curitiba: 30 bairros com votos agregados por correspondencia textual oficial.
- Sao Jose dos Pinhais: 8 bairros com votos agregados por correspondencia textual oficial.
- Secoes vinculadas por texto oficial: 614.
- Metodo registrado em `electoral_sections.neighborhood_assignment_method = 'official_neighborhood_name_in_tse_text'`.
- Confianca registrada: `0.7000`.

Esse metodo ja permite leitura inicial por bairro, mas nao deve ser tratado como cobertura completa da cidade.

## Estrategia recomendada para bairros

Recomendacao: usar leitura por pontos reais dos locais de votacao.

Pipeline:

1. Consolidar locais unicos:

```sql
municipality_id,
electoral_zone_id,
voting_place_number,
voting_place_name,
address
```

2. Geocodificar enderecos com fonte controlada:

- geocoder municipal, se existir;
- base oficial de equipamentos/enderecos municipais;
- Nominatim/OSM apenas com score e revisao;
- geocoding comercial apenas se permitido e auditavel.

3. Gravar:

```sql
electoral_sections.latitude
electoral_sections.longitude
electoral_sections.geom
electoral_sections.geocoded_at
```

4. Associar bairro:

```sql
UPDATE electoral_sections s
SET neighborhood_id = n.id,
    neighborhood = n.name
FROM neighborhoods n
WHERE s.municipality_id = n.municipality_id
  AND s.geom IS NOT NULL
  AND n.boundary IS NOT NULL
  AND ST_Contains(n.boundary, s.geom);
```

5. Reconstruir agregacoes:

```bash
npm run analytics:rebuild -- --campaign-id "<campaign-id>"
```

## Zonas eleitorais: pesquisa e decisao tecnica

### O que foi encontrado

O TSE disponibiliza votacao por municipio, zona e secao no Portal de Dados Abertos. A pagina oficial de Resultados 2022 lista recursos como votacao nominal por municipio e zona, detalhe por municipio/zona/secao e votacao por secao eleitoral por UF.

Referencia: https://dadosabertos.tse.jus.br/dataset/resultados-2022

O TRE-PR disponibiliza consulta de zonas eleitorais por numero, com finalidade institucional/administrativa.

Referencia: https://www.tre-pr.jus.br/institucional/zonas-eleitorais/zonas-eleitorais-tre-pr-pesquisa-por-numero-da-ze

Nao foi identificada, nesta etapa, uma fonte oficial publica do TSE/TRE-PR com shapefile/GeoJSON de poligonos internos de zonas eleitorais.

### Decisao

Adotar OPCAO B: leitura territorial por pontos reais.

Motivos:

- Zona eleitoral e uma unidade administrativa da Justica Eleitoral.
- Em municipios grandes, zonas podem ter distribuicao complexa de secoes e locais.
- Poligonos desenhados por interpolacao seriam artificiais.
- Sem shapefile oficial, qualquer limite de zona seria opinativo.
- Campanhas precisam de precisao operacional, nao mapa bonito com fronteira falsa.

## Estrategia recomendada para zonas

Nao criar poligonos de zona.

Usar:

- locais de votacao geocodificados;
- secoes como pontos;
- clusters por zona;
- heatmaps por votos;
- hull/convex hull apenas como camada analitica opcional, explicitamente marcada como "area de cobertura estimada", nunca como limite oficial.

Camadas:

```txt
zone_points: pontos dos locais/secoes da zona
zone_heatmap: densidade de votos por zona
zone_clusters: cluster de secoes por zona
zone_summary: agregacao tabular oficial por zona
```

## Comparativo tecnico

| Abordagem | Precisao | Confiabilidade eleitoral | Custo | Manutencao | Recomendacao |
|---|---:|---:|---:|---:|---|
| Poligono oficial de zona | Alta, se existir | Alta | Baixo/medio | Baixa | Usar somente se TSE/TRE publicar |
| Poligono inferido por bairro | Media/baixa | Baixa | Medio | Alta | Nao usar |
| Voronoi por locais de votacao | Visualmente util | Baixa como limite | Medio | Media | Apenas camada experimental, nao oficial |
| Pontos reais + heatmap | Alta para operacao | Alta | Medio | Media | Recomendado |
| Clusters por locais/secoes | Alta para campo | Alta | Baixo/medio | Media | Recomendado |

## Roadmap de implementacao

### Entregue

- Migration `0005_official_neighborhood_metadata`.
- Script `import-official-neighborhoods.ts`.
- Importacao oficial:
  - Curitiba: 75 bairros.
  - Sao Jose dos Pinhais: 42 bairros.
- Validacao PostGIS.
- Rebuild analitico acionado.

### Proxima etapa

1. Criar tabela de locais de votacao consolidados.
2. Criar pipeline de geocodificacao auditavel.
3. Popular `electoral_sections.geom`.
4. Rodar `ST_Contains` para bairros.
5. Rebuild de `territorial_vote_summaries`.
6. Ajustar mapa para:
   - bairros = coropletico real apos vinculo;
   - zonas = pontos/clusters/heatmap, sem poligono falso.

## Arquitetura ideal de pastas

```txt
scripts/
  import-official-neighborhoods.ts
  geocode-voting-places.ts
  assign-sections-to-neighborhoods.ts
  rebuild-analytics.ts

src/
  repositories/
    geographies/
      neighborhood-repository.ts
      voting-place-repository.ts
  services/
    gis/
      geometry-validation.ts
      geocoding.ts
      spatial-assignment.ts
```

## Regra de produto

O VotoPR nao deve mostrar poligonos de zonas eleitorais ate existir fonte oficial. A leitura por zona deve ser operacional, baseada em pontos reais de locais de votacao e agregacoes oficiais do TSE.
