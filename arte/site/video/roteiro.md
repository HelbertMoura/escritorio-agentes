# Tour da Firmópolis — roteiro

Vídeo de lançamento da Firmópolis para a seção `#tv` do site.
40 segundos, 1280×720, 30 fps, retro-pixel moderno.
Tudo em português do Brasil.

## Assets: só os reais

| Onde | O quê | Arquivo de origem |
| --- | --- | --- |
| Abertura e fecho | Assinatura com o prédio-mascote | `arte/marca/kit/assinatura-horizontal-escuro.svg` (sem a placa) |
| Escritório | Planta em blocos, dia, noite com chuva, fachada acesa | `docs/screenshots/35-planta-blocos.png`, `01-escritorio-dia.png`, `03-noite-chuva.png`, `32-fachada-noite.png` |
| Ponte | Terminais com nome, cartão de permissão, cartão de resposta, celular | `docs/screenshots/36-terminais-papeis.png`, `37-cartao-permitir.png`, `38-cartao-responder.png`, `09-celular.png` |
| Vida | Escritório vivo, rádio, andares por cidade, mapa do mundo | `docs/screenshots/26-banheiro-interditado.png`, `29-radio.png`, `31-andares-cidades.png`, `19-mundo-brasil.png` |

Nada é mock: nenhuma tela foi redesenhada, nenhum número inventado.

## Narração

Voz `pt-BR-AntonioNeural` (edge-tts, na máquina), +8% de velocidade.
Durações medidas, não estimadas.

| # | Entra | Duração | Fala |
| --- | --- | --- | --- |
| 1 | 0,70 s | 4,82 s | Seu time de agentes de IA, trabalhando no mesmo prédio. |
| 2 | 6,30 s | 3,62 s | Cada agente tem uma sala, um andar e uma cidade. |
| 3 | 10,40 s | 4,18 s | De dia o time trabalha. À noite, acende. |
| 4 | 15,30 s | 3,17 s | Cada terminal vira uma ponte para o escritório. |
| 5 | 19,00 s | 4,44 s | Um agente pede permissão. Você responde do mapa. |
| 6 | 23,80 s | 2,40 s | E isso também pelo celular. |
| 7 | 27,00 s | 3,50 s | O prédio tem vida própria: rádio e andares. |
| 8 | 30,80 s | 3,12 s | Cada workspace vira uma cidade no mapa. |
| 9 | 34,20 s | 5,50 s | Zero token. Só leitura por padrão. Código aberto. |

## Texto na tela

O texto não repete a narração: ele nomeia o que aparece.

| Momento | Texto |
| --- | --- |
| 1,05 s | Seu time de agentes de IA, / trabalhando no **mesmo prédio**. |
| 5,60 s | O Escritório **Vivo** |
| 6,00 s | Claude Code · Codex · OpenCode · agy · MiniMax · Maestri |
| 16,15 s | Um agente pede permissão. Você aprova no mapa. |
| 18,95 s | Você responde a pergunta direto no mapa. |
| 21,55 s | Aprove permissões e responda perguntas direto do **mapa** — até pelo **celular**. |
| 24,90 s | Vida **própria** |
| 28,70 s | SÃO PAULO |
| 30,00 s | TÓQUIO |
| 33,55 s | Assinatura da marca |
| 34,35 s | Zero **token** |
| 35,55 s | Só leitura **por padrão** |
| 37,45 s | Código aberto **(AGPL-3.0)** |
| 36,95 s | firmopolis.devmaniacs.com.br |
| 36,95 s | Roda no seu servidor, na sua rede. Sem caixa-preta. |

## Áudio

| Camada | Origem | Nível |
| --- | --- | --- |
| Trilha | lo-fi/chiptune original, sintetizado em `gerar-audio.py` (Am9–Fmaj7–Cmaj7–G6, 84 BPM, crackle de vinil) | −16 dB no barramento da cama |
| Efeitos | whoosh, blip, click, pop, riser — sintetizados, um por evento de imagem | −12 dB no barramento da cama |
| Narração | edge-tts `pt-BR-AntonioNeural`, comprimida como fala | −3 dB, na frente |

Mix final: ducking por `sidechaincompress` (a voz abaixa a cama),
loudnorm em duas passagens para **−16 LUFS** com pico de verdade em **−5,1 dBTP**.
Medido no arquivo entregue (`mestre.mp3`), não estimado.

## Reproduzir

```bash
bash arte/site/video/preparar-assets.sh          # recortes e logo a partir do projeto
~/.local/share/firmopolis-video-venv/bin/python arte/site/video/gerar-audio.py
cd arte/site/video
HYPERFRAMES_NO_TELEMETRY=1 hyperframes check
HYPERFRAMES_NO_TELEMETRY=1 hyperframes render --quality delivery -o .build/master.mp4
```
