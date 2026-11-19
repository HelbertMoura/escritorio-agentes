# Firmópolis: plano da fusão

Este plano junta o Escritório de agentes (este repositório, web e AGPL, com arte PixelLab) e o Escritório Vivo (`~/projetos/EscritorioVivo`, feito em Godot, com uma ponte em Go e arte LimeZu). O resultado se chama Firmópolis. A base é a web. Da Vivo, a ponte em Go entra como segunda fonte de dados, e as mecânicas "Sims" são reescritas no canvas. O Godot e a arte LimeZu ficam de fora, porque a licença da LimeZu proíbe redistribuir e o projeto é aberto.

Branch: `firmopolis`. O deploy em produção (o app e o site firmopolis.devmaniacs.com.br) só sai com o GO do Helbert.

## Onda 1: nome, ícones e abertura (feita)
- A aba, o PWA, o convite, o modo construção e o nome do app OAuth agora dizem "Firmópolis". A aba fica `<empresa> · Firmópolis`. A palavra "Escritório" continua como nome da página do mapa, porque o escritório é um lugar dentro de Firmópolis.
- Os ícones do PWA saíram do kit (`arte/marca/kit/`). O `logo.png` padrão passou a ser o mascote, em 32 px ampliado 6× sem suavizar.
- A abertura (`static/abertura.js`) roda por cima do carregamento, uma vez por sessão, e não roda no modo TV. Ela entrou na lista fechada de estáticos.
- Instalações já conectadas continuam com o nome antigo do app no agentes.chat até reconectar em `/oauth/conectar`.

## Onda 2: a ponte local como segunda fonte
Objetivo: o mapa mostrar também os terminais da máquina (Claude Code, Codex, agy, OpenCode, MiniMax e o Maestri), lidos pela ponte da Vivo.

- A ponte vem para `ponte/` deste repositório. O nome da pasta de config muda de `EscritorioVivo` para `Firmopolis`, os hooks mudam de `escritorio-vivo` para `firmopolis`, e o `setup --aplicar` migra os nomes antigos.
- **Decisão em aberto (arquitetura):** quem lê a ponte. Opção A: o navegador fala direto com `ws://127.0.0.1:47820`, o que pede o Origin do app na guarda da ponte, `connect-src` na CSP e o token colado uma vez. Opção B: a ponte empurra para o servidor do escritório, que vira a fonte única, mas aí os dados locais saem da máquina. A recomendação é a A: os terminais locais não saem do computador, o que segue a regra "só leitura, na sua máquina" do site.
- Critério de aceite: com a ponte ligada, cada terminal vivo aparece no mapa como terminalzinho, e o estado dele (ocupado, esperando você ou livre) bate com o da ponte em até 3 s. Com a ponte desligada, nada quebra e nenhum erro aparece.

## Onda 3: as três espécies no app
- Os **bichinhos de feltro** já existem (`avatar.js`) e representam os agentes do agentes.chat.
- Os **terminaizinhos** têm um monitor CRT como cabeça, um cursor como boca e a cor da moldura conforme o programa. O desenho já existe em `site/sprites.js` e vai para o mapa em escala de jogo.
- A **gente** é você e as visitas. As visitas já têm presença; a espécie só troca o boneco.

## Onda 4: mecânicas "Sims"
Necessidades e rotinas da Vivo (café, pausa, conversa no corredor), reescritas sobre o `vida.js`. O GDScript não é portado linha a linha. O gatilho continua sendo o estado real do agente, e nada é inventado.

## Onda 5: acabamento
- Revisão visual com capturas no desktop e no celular.
- Os READMEs e o CHANGELOG com o nome novo.
- O vídeo narrado da versão nova entra no lugar do chiado da TV do site.
