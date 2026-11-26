# Proveniência: sprites de cidades

Arte original gerada pelo PixelLab v2 (`POST /v2/create-image-pixen`, vista lateral, contorno de uma cor,
sem fundo, semente fixa) em 25/11/2026. Quatro gerações no total (Recife, Manaus descartada, Serra do Curral
e Manaus v2), sem retry cego. O plano trial cobrou gerações, não créditos: **US$ 0,00 debitados** e 4/4
gerações do lote consumidas (saldo antes e depois: `credits.usd` 8.03905829095178; `subscription.generations`
40/40 → 36/40). Nenhuma imagem de referência foi copiada; as formas vieram do relato histórico abaixo.

| Arquivo | Uso | Referências oficiais (forma e história) |
|---|---|---|
| `cidade-recife.png` | Casario do Recife Antigo, perto da orla | https://visite.recife.br/bairro-recife-antigo/ |
| `cidade-manaus.png` | Mercado Municipal Adolpho Lisboa, num lote visível | https://www.gov.br/iphan/pt-br/patrimonio-cultural/patrimonio-material/bens-tombados/conjuntos-urbanos-tombados-cidades-historicas/norte/manaus-am |
| `cidade-bh-serra-curral.png` | Serra do Curral, no fundo da cidade | https://prefeitura.pbh.gov.br/fundacao-de-parques-e-zoobotanica/informacoes/parques/parque-da-serra-do-curral |

Normalização: recorte no alfa, centralização sem escalar (pixel 1×) e chão removido quando era faixa de rua;
o alfa ficou binário (0/255). O manifesto completo da rodada, com prompts e folhas de conferência, está em
`/tmp/firmopolis-cidades-piloto/MANIFESTO.md`.

## Uso no atlas

- Recife: o casario ocupa o lote largo do Hospital ilustrativo (`predios-10`), o único seguro junto à orla nesta
  semente; não há casa genérica com a caixa inteira num lote da orla. O Hospital genérico não aparece à parte na cena.
- Manaus: substitui o Mercado Municipal (`predios-14`), que vira o Mercado Adolpho Lisboa; o Hospital permanece.
- Belo Horizonte: usa o lote largo do `predios-8` (53, 81) e entra no atlas reduzido por vizinho mais próximo a
  96×36 (o original de 128×48 fica no repositório).

## Recife · recortes da cena integral (26/11/2026)

Niobe gerou a cena em PixelLab Pro, `POST /v2/generate-image-v2`, semente
`20261126`, usando o guia da malha e uma captura do jogo sem a interface.
O job `15ab011e-04b6-494f-bd2e-898e893dd9ef` consumiu **25 gerações da
assinatura** (36 → 11), com **US$ 0,00 debitado**. O encaixe usou as imagens
já entregues e custou **0 gerações adicionais**.

O original `recife-pixellab-01-632x424.png` está em
`/tmp/firmopolis-pixellab-recife/raw/`. Seu SHA-256 é
`63dd8988030d4ea21198d938284f95b64a3e36881bd465c34dd1a77ad430cad2`.
Os recortes usam coordenadas do bruto, em pixels, com borda direita e
inferior exclusivas. Ambos entram no atlas em resolução nativa.

| Arquivo | Caixa no bruto | Ajuste e uso |
|---|---|---|
| `recife-frente.png` | `(406, 99, 527, 161)` | Máscara binária pelo contorno dos telhados e a base das cinco fachadas. Encaixe na quadra oeste, sombra existente e vidros marcados nos cinco imóveis. Reserva `casa-4`. |
| `recife-pedra.png` | `(440, 168, 480, 178)` | Amostra de lajes. Repetição no piso das quadras, praças e cais, recortada pela planta. Juntas desenhadas são a reserva. |

Canal, pontes e faixas continuam usando a malha navegável. A sobreposição
da Niobe em `/tmp/firmopolis-pixellab-recife/prova/prova-encaixe-sobreposicao-640x440.png`
registra o deslocamento do traçado no bruto e a invasão de algumas faixas
por fachadas. O acabamento do pátio do chalé, canteiros e entrada do passeio
foi desenhado sobre os polígonos da malha, junto dos acessos existentes.

## Recife · cena integral no Mundo (26/11/2026)

`static/mundo/cenas/recife.png` é o PNG nativo de 632×424 do mesmo job
`15ab011e-04b6-494f-bd2e-898e893dd9ef`, sem recorte nem escala, importado por
`ferramentas/montar_cenas.py importar` como PNG indexado: os pixels RGBA são
iguais aos do bruto (SHA-256
`63dd8988030d4ea21198d938284f95b64a3e36881bd465c34dd1a77ad430cad2`, na tabela do
fim). Ele não passa pelo `ferramentas/montar_mundo.py`. Integrá-lo custou **0
gerações adicionais**.

Ao contrário do encaixe por recortes descrito acima, aqui a planta se ajusta à
imagem: `static/mundo/cenas/recife.json` (esquema v1) define nas coordenadas do
PNG a rede de calçadas, as travessias, os dois tabuleiros, a pista do carro, a
praça, a portaria (a fachada azul), os textos e as faixas de oclusão, e
`CidadePlanta.cena(dados)` valida esses dados e monta a planta. O manifesto
`static/mundo_cidade_cenas.js` guarda a versão e o `integrity` do PNG e do JSON,
e o navegador confere os bytes dos dois pelo Fetch antes de usá-los. Trocar o PNG
exige refazer as coordenadas do JSON; mudar qualquer um dos dois exige atualizar
o manifesto (`montar_cenas.py indice`; o `test_montar_cenas.py` confere que ele
bate com o disco, e `montar_cenas.py validar` confere a geometria contra as cores
da arte). Sem os
dois arquivos válidos (rede, 404, integridade, esquema ou tamanho errado), o
Recife usa a malha navegável e tenta de novo na próxima entrada. O servidor lê a
lista de `static/mundo/cenas/` na partida: arquivo novo só aparece depois de
reiniciar.

## Cenas importadas (montar_cenas.py)

PNG indexado sem perda (RGBA igual ao do bruto).

| Cidade | Arquivo de origem | SHA-256 do bruto | Data |
|---|---|---|---|
| `recife` | `recife-pixellab-01-632x424.png` | `63dd8988030d4ea21198d938284f95b64a3e36881bd465c34dd1a77ad430cad2` | 26/11/2026 |
| `manaus` | `manaus-pixen-600x436-retry.png` | `ec71224d11447a2bb72f6fb4e2866eb924d05d0599b7b3ac5571578fdef32d74` | 26/11/2026 |
| `belo-horizonte` | `belo-horizonte-pixen-616x424.png` | `7bcee6130ce51529ab30c2eda67fff359138d325dc1674693ae6112e79040af3` | 26/11/2026 |
| `salvador` | `salvador-pixen-576x400-retry.png` | `75e3a22612b830e74b1dc8ecbc6bb84aa6a77088bc0a0d713f4d35a996056bdc` | 26/11/2026 |
| `mateus-leme` | `mateus-leme-pixen-576x400.png` | `339378138c03c9079e75345263e20568b9076ae55296eae73093f30172a8b53b` | 26/11/2026 |

Piloto (26/11/2026): Manaus, Belo Horizonte, Salvador e Mateus Leme, autoria pelo Opus com `montar_cenas.py`.
Brutos em `/home/dm/projetos/firmopolis-pixellab-cenas/raw/`, escolhidos pelo `trabalho/escolhas.json` (Manaus e
Salvador são as novas tentativas; BH e Mateus Leme, a 1ª).

- **Manaus, retoque de pixel antes do `importar`:** três carros desenhados nas faixas por onde passa a pista foram
  cobertos com um trecho limpo da mesma faixa, deslocado ao longo da rua (nenhuma cor nova; 74 cores antes e depois):
  `[181,196,192,217]` com a fonte 30 px abaixo, `[181,263,192,286]` com a fonte 30 px acima e `[206,319,228,331]` com
  a fonte 30 px à direita (borda direita e inferior exclusivas). Bruto original
  `manaus-pixen-600x436-retry.png` (SHA-256 `ae6d827feeee026c1f24da92992c0bb82fefb26f77c8974a2750ec05c3fd924f`);
  o retocado, com o mesmo nome em `firmopolis-pixellab-cenas/retoque/raw/`, é o da linha acima (`ec71224d…`). O
  script é `retoque/retocar.py`.
- BH, Salvador e Mateus Leme entram sem retoque: a pista passa só por trechos de faixa sem carro desenhado.
