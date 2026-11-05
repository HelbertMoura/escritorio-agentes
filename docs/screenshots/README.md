# Screenshots · Capturas

Captured images for the README, retaken on 2026-11-05 (2D map, Conversations page and opening hours). · Imagens capturadas para o README, refeitas em 05/11/2026 (mapa 2D, página Conversas e expediente).

`docs/social-preview.png` (1280×640) is the repository's social preview. · É a prévia social do repositório.

`docs/demo.gif` (800 px, 12 fps, 12 s, captions in Portuguese) is the animated demo at the top of the READMEs, cut from the demo-mode video; with "reduce motion" on, the READMEs show `01-escritorio-dia.png` instead. To redo it, run `gif.sh` next to the video (two ffmpeg passes: `palettegen=max_colors=192:stats_mode=diff`, then `paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, both with `fps=12,scale=800:-1:flags=lanczos`, from 3.2 s for 12 s) and copy the result here. · É a demonstração animada do topo dos READMEs, cortada do vídeo do modo demonstração; com "reduzir movimento" ligado, os READMEs mostram a `01-escritorio-dia.png`. Para refazer, rode o `gif.sh` ao lado do vídeo (duas passadas do ffmpeg, com os filtros acima) e copie o resultado para cá.

**Rule · Regra:** fictional data only. Use demo mode (`?demo=1`) or a preview with fictional data (`times.exemplo.json` and a made-up `dados.json`). Never a real workspace, a real organization id or real agent names, and no browser address bar in the image. · Só dados fictícios: modo demonstração (`?demo=1`) ou uma prévia com dados inventados (`times.exemplo.json` e um `dados.json` fictício). Nunca um workspace real, o id de uma organização real ou nomes reais de agentes, e sem a barra de endereço do navegador na imagem.

PNG, 1440×900 for desktop and 390×844 for phone. · PNG, 1440×900 no computador e 390×844 no celular.

| File · Arquivo | What it shows · O que mostra | How · Como |
|---|---|---|
| `01-escritorio-dia.png` | The whole office by day · O escritório inteiro de dia | `?demo=1&hora=10`; wait until a request and a question show up, and hide the Simulation strip · espere aparecer um pedido e uma pergunta e esconda a faixa da Simulação |
| `02-esperando-voce.png` | "!" and "?" on the map and the "Waiting for you" list · "!" e "?" no mapa e a lista "Esperando você" | the same as 01, scrolled to the map · o mesmo do 01, rolado até o mapa |
| `03-noite-chuva.png` | Night with rain, lights and windows · Noite com chuva, luzes e janelas | `?demo=1&hora=19.5&clima=chuva` (still within opening hours: after closing, whoever has no task goes home · ainda no expediente: depois de fechar, quem está sem tarefa vai para casa) |
| `04-natal-neve.png` | Christmas decorations in the snow · Enfeites de Natal na neve | `?demo=1&data=2026-12-25&hora=19&clima=neve` |
| `05-conversas.png` | The Conversations page with a conversation open, the reply box and the reply-mode badge · A página Conversas com uma conversa aberta, a caixa de resposta e o selo do modo resposta | fictional preview with `ferramentas/previa.exemplo.json` (made-up org id and links), `"conversas": "responder"` and a fictional conversation; demo mode hides this page · prévia fictícia com `ferramentas/previa.exemplo.json` (id de organização e links inventados), `"conversas": "responder"` e uma conversa fictícia; o modo demonstração esconde esta página |
| `06-simulacao.png` | The Simulation panel open · O painel de Simulação aberto | `?demo=1`, then the sun-and-cloud button · depois o botão de sol e nuvem |
| `07-personalizar.png` | The Customize screen, with accent color, logo and opening hours · A tela Personalizar, com cor de destaque, logo e expediente | fictional preview · prévia fictícia (`ESCRITORIO_TIMES=times.exemplo.json`); demo mode blocks this screen · o modo demonstração bloqueia esta tela |
| `08-entrar.png` | The sign-in / first-access screen · A tela de entrar / primeiro acesso | fictional preview, `/entrar` · prévia fictícia, `/entrar` |
| `09-celular.png` | The office on a phone · O escritório no celular | `?demo=1`, 390×844 |
| `10-modo-foto.png` | A photo-mode PNG · Um PNG do modo foto | `?demo=1`, photo mode · modo foto |
