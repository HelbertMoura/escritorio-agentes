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
