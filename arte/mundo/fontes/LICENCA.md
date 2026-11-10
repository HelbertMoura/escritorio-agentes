# Fontes dos contornos do mundo

Os contornos vêm do **Natural Earth** (https://www.naturalearthdata.com), que está em **domínio público**.
Não há exigência de atribuição; citamos a fonte por clareza. Termos: https://www.naturalearthdata.com/about/terms-of-use/

Baixados em 09/11/2026 do repositório oficial no GitHub, `nvkelso/natural-earth-vector`, branch `master`
(commit `ca96624a56bd078437bca8184e78163e5039ad19`), pasta `geojson/`:

| Arquivo | Origem | Alteração |
|---|---|---|
| `ne_110m_admin_0_countries.geojson` | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson | Nenhuma (cópia fiel). |
| `ne_50m_admin_1_states_provinces_lakes.geojson` | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lakes.geojson | Só as 27 feições com `adm0_a3 == "BRA"`; as demais chaves do arquivo ficaram iguais. |
| `ne_50m_rivers_lake_centerlines.geojson` | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_rivers_lake_centerlines.geojson (baixado em 09/11/2026, SHA-256 do original `f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51`) | Recorte da caixa do mapa do Brasil com 1° de folga (lon −75 a −33, lat −35 a 7): cada linha foi cortada nos trechos de pontos dentro dela (trecho com menos de 2 pontos sai), e só ficaram as 40 feições com algum trecho; toda geometria virou `MultiLineString`, e as `properties` ficaram iguais. |
