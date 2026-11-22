#!/usr/bin/env bash
# Prepara os assets do tour da Firmópolis a partir dos arquivos reais do projeto.
# Regra: nada de imagem genérica. Tudo vem de docs/screenshots/, arte/marca/kit/ e site/fontes/.
#
# Os recortes de tela são 640x360 ampliados 2x (nearest neighbor) para o pixel art
# ficar grande e nítido no vídeo 1280x720. A planta em blocos fica em 1x porque é
# um plano aberto que precisa caber inteiro no quadro.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
S="$RAIZ/docs/screenshots"
IMG="$RAIZ/arte/site/video/assets/img"
FONTES="$RAIZ/arte/site/video/assets/fonts"

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir -p "$IMG" "$FONTES"

recorte2x() {  # recorte2x <origem> <geometria> <destino>
  convert "$S/$1" -crop "$2" +repage -filter point -resize 200% \
    -strip -define png:compression-level=9 "$IMG/$3"
}

# --- Abertura e fechamento: assinatura e mascote oficiais ---
# A assinatura "-escuro" vem com a placa #1c1c22 assada no SVG. Para o filme,
# a placa sai e o reste da arte (creme, indigo, ambar) fica como esta.
sed 's|<rect width="1184" height="256" rx="0" fill="#1c1c22"/>||' \
  "$RAIZ/arte/marca/kit/assinatura-horizontal-escuro.svg" > "$BUILD_DIR/assinatura.svg"
inkscape "$BUILD_DIR/assinatura.svg" --export-type=png \
  --export-filename="$IMG/assinatura.png" --export-width=1184
cp "$RAIZ/arte/marca/kit/icone-mascara-512.png" "$IMG/mascote.png"

# --- Cenas 2 a 4: telas reais do Escritório Vivo ---
convert "$S/35-planta-blocos.png" -crop 1280x720+80+80 +repage \
  -strip -define png:compression-level=9 "$IMG/planta-blocos.png"
recorte2x 35-planta-blocos.png 640x360+80+100 planta-blocos-zoom.png
recorte2x 01-escritorio-dia.png 640x360+320+155 dia.png
recorte2x 03-noite-chuva.png    640x360+330+160 noite.png
recorte2x 03-noite-chuva.png    640x360+330+300 noite-chuva.png
recorte2x 32-fachada-noite.png  640x360+560+420 fachada.png
recorte2x 36-terminais-papeis.png 640x360+240+280 terminais.png
recorte2x 37-cartao-permitir.png 640x360+0+190 permitir.png
recorte2x 38-cartao-responder.png 640x360+0+380 responder.png
convert "$S/09-celular.png" -crop 390x680+0+84 +repage \
  -strip -define png:compression-level=9 "$IMG/celular.png"
recorte2x 31-andares-cidades.png 640x360+320+100 andar-sp.png
recorte2x 31-andares-cidades.png 640x360+320+540 andar-toquio.png
recorte2x 29-radio.png              640x360+430+20 radio.png
recorte2x 26-banheiro-interditado.png 640x360+700+150 vida.png
recorte2x 19-mundo-brasil.png       640x360+250+300 mundo.png

# --- Tipografia da marca ---
cp "$RAIZ/site/fontes/PixeloidSans.woff2" "$FONTES/PixeloidSans.woff2"
cp "$RAIZ/site/fontes/figtree.woff2"     "$FONTES/figtree.woff2"

echo "assets prontos em $IMG"
