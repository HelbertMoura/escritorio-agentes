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
| `rio-branco` | `rio-branco-pixen-576x400.png` | `83c1cd5c20edaee97216181537211fe4ad832aeef5260ea2ffd46f80f63e80b3` | 26/11/2026 |
| `maceio` | `maceio-pixen-576x400.png` | `71e3a7f490bf7b9671df4a2701e625c29fded0fe6858c77c27d4628485c5518b` | 26/11/2026 |
| `macapa` | `macapa-pixen-576x400.png` | `ddd9d59f7ac45f5ed384d6fbc764f91263ab7389cf1a1ee5d053a881c0aed86a` | 26/11/2026 |
| `fortaleza` | `fortaleza-pixen-576x400.png` | `39d6b159dcdc5f97af51d15d159755a1b2ea7e748017911060efe11e5fdc7c0d` | 26/11/2026 |
| `brasilia` | `brasilia-pixen-576x400.png` | `a61e754460f5ac0c9581ce1994351189cc2ae90588a6283da676eee58f4ca31b` | 26/11/2026 |
| `vitoria` | `vitoria-pixen-576x400.png` | `6c581d17b34c33b8ba9a6f88c80d2319cd2ebce59e9ef00317248e35e4d458d8` | 26/11/2026 |
| `goiania` | `goiania-pixen-576x400.png` | `01704f377729f8e97fe5c85e4e62ce8e38c61610982ea991b7912a1512f5939b` | 26/11/2026 |
| `sao-luis` | `sao-luis-pixen-576x400.png` | `e301def308e3921e8af9d158e511c54bdd9572479a4c6c5780a6680a1134351c` | 26/11/2026 |
| `cuiaba` | `cuiaba-pixen-576x400.png` | `1d6f923cb9c68e2e53e69c3670854b7796487f9379671c430805d4b8292010bd` | 26/11/2026 |
| `campo-grande` | `campo-grande-pixen-576x400.png` | `9f8846422d5363c23d5bcac48a072807f5db47a0c0c25b9fda5d01260861b9ae` | 26/11/2026 |
| `sao-paulo` | `sao-paulo-pixen-576x400.png` | `810cdf158d56dffee53b8ad0410cb721608f02edc0c90dbb0becab84af6ab9a7` | 26/11/2026 |
| `aracaju` | `aracaju-pixen-576x400.png` | `cfbcb59af8c5a5fc90e649f8d5e89e56595e95725ef4c17de2f79f3344667c47` | 26/11/2026 |
| `palmas` | `palmas-pixen-576x400.png` | `25943ecdf544aab9995387d8a9bd448af4a03c1c2ab6546a8d137325b23856cb` | 26/11/2026 |
| `lisboa` | `lisboa-pixen-576x400.png` | `b30b2ce43be338a118b72cf4834b59779cab0cfe8c1f61030a1c0857998ddd64` | 26/11/2026 |
| `luanda` | `luanda-pixen-576x400.png` | `8a48d7e4667b7cf480e00c109d29aa8eaa9815b2efb656fc073293455e9acce5` | 26/11/2026 |
| `maputo` | `maputo-pixen-576x400.png` | `dd4a69150c08e4668ccdfe8a98df402aaf90d2f0d265f81bd028ace276dd4d71` | 26/11/2026 |
| `buenos-aires` | `buenos-aires-pixen-576x400.png` | `e8f2289b64fabb9056b0177ff26175b98b59fe668acdc196a40a064c44c14baf` | 26/11/2026 |
| `montevideu` | `montevideu-pixen-576x400.png` | `3223fef13d8402541d4f08aac29fbedb40e5b93dd938fe4cfd2731bb78d0ca73` | 26/11/2026 |
| `santiago` | `santiago-pixen-576x400.png` | `5acf0a747c15481c37c4418b7cadfcd1dc8cc972b5cdafe3a88d1a077017ab65` | 26/11/2026 |
| `cidade-do-mexico` | `cidade-do-mexico-pixen-576x400.png` | `313979337b057b8540760169c3272d374884c93c791d1840c98dbba70d169240` | 26/11/2026 |
| `belem` | `belem-pixen-576x400.png` | `164c696c05c7c7930894648cfe7fa380240824911495ababfe679fad389cc051` | 26/11/2026 |
| `joao-pessoa` | `joao-pessoa-pixen-576x400.png` | `ab6125f3d94c9d32d0a2e6a04e5144d3d014a0fed06744e017c2c26ab6595759` | 26/11/2026 |
| `curitiba` | `curitiba-pixen-576x400.png` | `7959b2cbe8d8d42f5b9c17b30776af72efd373071d6b1b52f3539ff5e6202992` | 26/11/2026 |
| `teresina` | `teresina-pixen-576x400.png` | `219646941b7420f45955137984a2e514f7b1fa32e4b628782e00829eed7835e2` | 26/11/2026 |
| `rio-de-janeiro` | `rio-de-janeiro-pixen-576x400.png` | `d6346d5dd66da43d81daa38dd478d767b80bb660dcf2e7b3f0922b8199e9e5d2` | 26/11/2026 |
| `natal` | `natal-pixen-576x400.png` | `4453b6bd990760ff65a47670d472b9302a36fdf6fd9ec0f37f722773a709bdad` | 26/11/2026 |
| `porto-alegre` | `porto-alegre-pixen-576x400.png` | `7f65561987dfaf63cc44f2ce7ae99550dcbf81e6d180c1bb01f86e3e0dd90db4` | 26/11/2026 |
| `porto-velho` | `porto-velho-pixen-576x400.png` | `3e5578c6bcb681faf0f239cee95e15c1a8ec0791da6febd320bef39741f7bf39` | 26/11/2026 |
| `boa-vista` | `boa-vista-pixen-576x400.png` | `c03f380f9c17219b7dd02bceb14ee720247b5c9abde4952955701b356ccc0d56` | 26/11/2026 |
| `florianopolis` | `florianopolis-pixen-576x400.png` | `4e91e6cb5f6d7017158f1af18bf5cbda18fff79cbdb73a28f7a980fc230046ba` | 26/11/2026 |
| `nova-york` | `nova-york-pixen-576x400.png` | `b6afaf1dd3436d98befeb2a374cc0aaef6eba21990778f9a15db62cb70bb1eb4` | 26/11/2026 |
| `londres` | `londres-pixen-576x400-retry.png` | `7eb8dc02065d3c922d861a562505dbe544b8b53d8543aa5cc861c6b5f901f2f7` | 26/11/2026 |
| `paris` | `paris-pixen-576x400.png` | `df1a972ccb7e9caf05c35aa820e55bf958ee2adb6c65c29de3efccb053eec1a2` | 26/11/2026 |
| `madri` | `madri-pixen-576x400.png` | `d64b9b6a4eddf809f64c8a49a54a308c58f14a1525351bdefa1c4a002935a93f` | 26/11/2026 |
| `toquio` | `toquio-pixen-576x400.png` | `adf9e04ef81c5abee244798be55185f4803c291a392883fb1911fd4566056138` | 26/11/2026 |
| `campinas` | `campinas-pixen-576x400.png` | `fdfaad29a4af0c4f2cfaaa4e2cae74ee51193e0e44b8a25c7fa1580a0e3432cc` | 26/11/2026 |
| `santos` | `santos-pixen-576x400.png` | `bd245773ed66a949b61190e0761d50dbe391d06bfde08148d1a9951909de99a3` | 26/11/2026 |
| `joinville` | `joinville-pixen-576x400.png` | `faabc4c96f620bb25876b5c4ce18243bfbe313e08f4d13db35a6354b18c273ae` | 26/11/2026 |
| `sao-jose-dos-campos` | `sao-jose-dos-campos-pixen-576x400.png` | `54e9adcf9cab25dcd99d3d107031eeb969e8a26ae4847f703042be1b9c0f9ced` | 26/11/2026 |
| `uberlandia` | `uberlandia-pixen-576x400.png` | `be608eb47b524d4ff1e3ba5007d2094b6ad7f57a965a8f552479daf6a34baa7e` | 26/11/2026 |

Lote 4 (26/11/2026): Nova York, Londres, Paris, Madri, Tóquio, Campinas, Santos, Joinville, São José dos Campos e
Uberlândia, autoria pelo Opus com `montar_cenas.py`. Brutos em `/home/dm/projetos/firmopolis-pixellab-cenas/raw/`, 1ª tentativa
(Londres: o retry, pelo `escolhas.json`), sem retoque de pixel.

Lote 2 (26/11/2026): Belém, João Pessoa, Curitiba, Teresina, Rio de Janeiro, Natal, Porto Alegre, Porto Velho, Boa Vista e
Florianópolis, autoria pelo Opus com `montar_cenas.py`. Brutos em `/home/dm/projetos/firmopolis-pixellab-cenas/raw/`, 1ª tentativa
(nenhuma tem entrada no `escolhas.json`), sem retoque de pixel.

Piloto (26/11/2026): Manaus, Belo Horizonte, Salvador e Mateus Leme, autoria pelo Opus com `montar_cenas.py`.
Brutos em `/home/dm/projetos/firmopolis-pixellab-cenas/raw/`, escolhidos pelo `trabalho/escolhas.json` (Manaus e
Salvador são as novas tentativas; BH e Mateus Leme, a 1ª).

- **Manaus, retoque de pixel antes do `importar`:** três carros desenhados nas faixas por onde passa a pista foram
  cobertos com um trecho limpo da mesma faixa, deslocado ao longo da rua (nenhuma cor nova; 74 cores antes e depois):
  `[181,196,192,217]` com a fonte 30 px abaixo, `[181,263,192,286]` com a fonte 30 px acima e `[206,319,228,331]` com
  a fonte 30 px à direita (borda direita e inferior exclusivas). Bruto original
  `manaus-pixen-600x436-retry.png` (SHA-256 `ae6d827feeee026c1f24da92992c0bb82fefb26f77c8974a2750ec05c3fd924f`);
  o retocado, com o mesmo nome em `firmopolis-pixellab-cenas/retoques/raw/`, é o da linha acima (`ec71224d…`). O
  script é `retoques/retocar.py`.
- BH, Salvador e Mateus Leme entram sem retoque: a pista passa só por trechos de faixa sem carro desenhado.
