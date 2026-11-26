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
