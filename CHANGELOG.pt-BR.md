> [🇺🇸 English](./CHANGELOG.md) | 🇧🇷 Português (Brasil)

# Histórico de mudanças

As mudanças que importam neste projeto ficam aqui, da mais nova para a mais antiga. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não tem número de versão: cada entrada é um marco, com a data e os commits.

## Ainda não publicado · Modo TV, visitantes, jornal e aviso no celular

O `config_v` e os visitantes no commit [`89873f5`](https://github.com/HelbertMoura/escritorio-agentes/commit/89873f5); o jornal no [`56f9f46`](https://github.com/HelbertMoura/escritorio-agentes/commit/56f9f46); o aviso no celular, no commit seguinte.

### Adicionado
- O `/api/estado` ganhou o `config_v`: 12 hex que mudam quando muda um arquivo de configuração (`times.json` e, em `dados/`, a marca, o logo, a planta, o clima, as datas e a equipe). Sai só do tamanho e da data de cada arquivo, sem ler o conteúdo. O modo TV recarrega a página quando ele muda.
- **Visitantes:** o `/api/estado` ganhou o `visitantes`, a lista de quem mais está com o escritório aberto, só com um id anônimo e uma cor (`?invisivel=1` olha sem aparecer). Veja [Segurança](./README.pt-BR.md#segurança). A prévia ganhou o `--visitantes N`.
- **Jornal da semana:** `jornal.py` e `GET /api/jornal`, com os números da semana atual e da anterior (tarefas, aprovações, respostas e minutos por agente; clima, greves e brigas por dia), em `dados/jornal.json`, só com ids e números. Veja [Segurança](./README.pt-BR.md#segurança). A prévia conta as leituras dela e ganhou o `--jornal`, que sobe com as duas semanas preenchidas.
- **Aviso no celular:** push nativo sem conteúdo, assinado com VAPID (`vapid.py`, ES256 em Python puro) e enviado por `avisos.py` quando um agente pede aprovação ou resposta, com as rotas `GET /api/push/chave`, `POST /api/push/assinar`, `POST /api/push/sair` e `GET /api/avisos`. Só com a `ESCRITORIO_BASE` em https. O **Sair de todos os aparelhos** também desliga o aviso em todos eles. Veja [Segurança](./README.pt-BR.md#segurança). A prévia ganhou o `--push`, com um serviço de push falso e local.

### Mudado
- Trocar a conta no agentes.chat também recomeça a lista de eventos e os resolvidos do dia, como num reinício: nada da conta anterior fica à vista nem entra no jornal.

### Corrigido
- O `instalar.sh` passa a instalar e compilar o `ajustes.py` (desde as Configurações, o serviço instalado por ele caía ao subir) e o `jornal.py`, e copia o `manifest.webmanifest`.

## Ainda não publicado · Conectar, Docker e Configurações

O Conectar e o Docker no commit [`cf29e8c`](https://github.com/HelbertMoura/escritorio-agentes/commit/cf29e8c); o clima e as datas no [`13b91a2`](https://github.com/HelbertMoura/escritorio-agentes/commit/13b91a2); os times e o Sair de todos, sem commit ainda.

### Adicionado
- **Conectar pela tela:** o `/api/estado` ganhou o campo `conexao` (`carregando`, `conectado`, `sem_conexao`, `recusada`, `pausa` ou `falha`), e o `/api/config` ganhou o `base`. Na volta da autorização, a primeira leitura sai na hora. Veja [Conectar ao agentes.chat](./README.pt-BR.md#conectar-ao-agenteschat).
- **Docker e Coolify:** `Dockerfile`, `.dockerignore` (lista de permissão) e `docker-compose.yml` sem portas publicadas, com a variável nova `ESCRITORIO_BIND` (`127.0.0.1` ou `0.0.0.0`). Veja [Docker e Coolify](./README.pt-BR.md#docker-e-coolify).
- **Cidade do clima pela tela:** busca pelo nome (geocoding do Open-Meteo, pelo servidor, com 10 buscas por minuto e 200 por dia), **Sem clima** e **Voltar ao times.json**, em `dados/clima.json`. Trocar a cidade não pede mais reinício.
- **Datas comemorativas pela tela:** desligar as 13 embutidas e criar até 24 próprias (todo ano ou uma vez, de 1 a 14 dias, com tema e falas), em `dados/festas.json`.
- **Times e aparência pela tela**, em `dados/equipe.json` (substituem os do `times.json`; **Voltar ao times.json** apaga o arquivo).
- **Sair de todos os aparelhos**: com a senha de novo, encerra todas as sessões.
- `ferramentas/agentes_falso.py`: um agentes.chat de mentira, só em `127.0.0.1`, para testar o Conectar inteiro e cada falha sem a conta de verdade. A prévia ganhou o `--conexao <estado>`.

### Mudado
- HTTP 402 e 403 na leitura deixam de aparecer como queda de rede: viram `recusada`, com o código e um texto do escritório, como o 401. Enquanto a recusa continuar, a leitura espera de 30 s até 5 min, em vez de repetir a cada 30 s.
- Os erros do `/oauth/conectar` e do `/oauth/retorno` viram uma página curta, que diz o motivo e oferece tentar de novo.
- Entrar por um endereço diferente da `ESCRITORIO_BASE` mostra o endereço certo na tela de entrar.
- A `ESCRITORIO_BASE` precisa ser só a origem (sem caminho nem barra no fim, host em minúsculas). Fora disso, o serviço não sobe e diz o porquê. A barra no fim deixou de ser cortada sem aviso.

### Segurança
- O `error_description` e o corpo das respostas do agentes.chat nunca chegam à tela, e o log guarda só o código do erro.
- `POST /api/clima` e `POST /api/festas` no molde do `POST /api/planta`: origem estrita, sessão, só JSON, teto de corpo, tudo ou nada (sem `NaN`, `Infinity` nem `true` no lugar de número) e gravação atômica sob trava; as datas com `rev`. A busca de cidade fala só com o Open-Meteo, sem redirecionamento, e o log não guarda a cidade nem a busca.
- Com `ESCRITORIO_BIND=0.0.0.0`, a `ESCRITORIO_BASE` é obrigatória. A imagem roda com usuário próprio, sem shell, e o compose roda só de leitura, sem capacidades e com memória limitada. O README ganhou o que muda com um [endereço público](./README.pt-BR.md#endereço-público).

## 2026-11-06 · Modo construção v1

Release [`v2026.11.06`](https://github.com/HelbertMoura/escritorio-agentes/releases/tag/v2026.11.06), com o vídeo de lançamento (narração em português do Brasil, com legenda). Commits [`4860c88`](https://github.com/HelbertMoura/escritorio-agentes/commit/4860c88) e [`26192a6`](https://github.com/HelbertMoura/escritorio-agentes/commit/26192a6).

### Adicionado
- **Modo construção** (`construir.html`, aberto pelo **Personalizar**): pintar a parede e o piso de cada sala; mover, espelhar, tirar e pôr móveis de um catálogo de 53 enfeites (peça nova é só enfeite: ninguém senta nela). Veja [Modo construção](./README.pt-BR.md#modo-construção).
- Desfazer e refazer (até 100 passos), **Descartar**, **Voltar ao automático** (com diálogo de confirmação) e **Salvar**, que fica bloqueado enquanto um assento estiver sem passagem e marca esse assento no mapa.
- Tudo funciona sem arrastar e pelo teclado: Tab e Enter escolhem a peça, as setas movem (8 px; Shift: 1 px), `E` espelha e `Delete` tira. As mudanças são anunciadas ao leitor de tela.
- A planta fica salva no servidor, em `dados/planta.json`, pelo `POST /api/planta`, e a mesma planta chega a todas as telas ao recarregar. Ela é aplicada por cima do prédio automático: com a planta vazia, o prédio fica idêntico ao de antes.
- `construir.html?demo=1`: uma demonstração do editor com exemplo próprio, em que nada é salvo.
- Testes no `test_planta.py` e conferências da rota nova no `ferramentas/checar_seguranca.py`; o `ferramentas/checar_planta_mapa.mjs` compara o prédio com e sem planta.

### Mudado
- A mesa de pingue-pongue fica 12 px mais acima, para o jogador de baixo ter passagem. Isso muda o prédio automático de todos os escritórios, mesmo sem planta.

### Segurança
- `POST /api/planta`: o `Origin` precisa ser o endereço do servidor (sem cair para o `Referer`), exige sessão, só aceita JSON (senão, 415), corpo de até 64 KB, validação tudo ou nada (a mesma na leitura e no salvar) e o `rev` atual (409 quando outra tela salvou antes). A gravação é feita sob uma trava, com a gravação atômica em 0600; o log guarda contagens, nunca o conteúdo.
- Um `planta.json` ilegível ou inválido volta ao prédio automático, com uma linha no log; uma planta ruim nunca derruba a página.
- Todo `POST` lê o corpo (até 128 KB) antes de responder, para a recusa chegar ao cliente em vez de a conexão cair; cada rota mantém o seu teto de tamanho.
- O ringue, o quadro do placar, o painel do logo e as placas não se editam, e nada movido ou posto pode cobri-los.

## 2026-11-06 · Vida social, fatia 2: greve, reclamações, fofoca e entregas

Commit [`5dbdc73`](https://github.com/HelbertMoura/escritorio-agentes/commit/5dbdc73).

### Adicionado
- **Reclamações e sugestões** em balões, e **fofoca** no bebedouro ("Psiu…"), sem nome no balão. Elas mexem nas amizades.
- **Greve** na Sala comunal, no máximo uma por dia: os livres sentam no chão na frente do ringue com plaquinhas de papelão, com um aviso em cima do mapa e o botão **Atender o pedido**. Clicar numa plaquinha faz o mesmo.
- **Entregas**, uma por pedido: o motoboy da pizza chega de moto, o entregador traz o café, um bolo com vela, um pufe novo, um roteador, travesseiros, o ar no 23 ou a faixa "Sexta livre aprovada!" com festinha. Iguais em todas as telas, desenhadas em pixel art e com sons próprios.
- `POST /api/social/greve/atender`, com as mesmas regras das outras rotas da vida social.
- Testes T-G1 a T-G5 e acessibilidade do aviso da greve.

### Mudado
- O **modo sério** pausa também a greve e as entregas. Quem trabalha ou espera você nunca sai da mesa.

## 2026-11-06 · Vida social, fatia 1: amizades, Ringue e placar semanal

Commit [`81ba7b5`](https://github.com/HelbertMoura/escritorio-agentes/commit/81ba7b5).

### Adicionado
- **Amizades e rivalidades** de cada dupla de agentes, decididas pelo servidor (`social.py`) e iguais em todas as telas.
- **Ringue** na Sala comunal: brigas automáticas e **Mandar pro ringue** pela ficha do agente, com gongo, plateia, nuvem de poeira de desenho animado, sons, a faixa do vencedor e as pazes depois. Só entram os livres.
- **Placar semanal** (segunda a domingo, no horário de Brasília), com o top 3 num quadro na parede do ringue, o ranking completo ao clicar nele e o campeão da semana passada. Gravado em `dados/placar.json`.
- **Modo sério** no **Personalizar**, que pausa a vida social inteira.

## 2026-11-05 · Conversas, modo resposta e expediente

Commits [`0d13e25`](https://github.com/HelbertMoura/escritorio-agentes/commit/0d13e25) e [`cdec3b7`](https://github.com/HelbertMoura/escritorio-agentes/commit/cdec3b7).

### Adicionado
- Página **Conversas** (`"conversas": "ler"`, desligada por padrão): a lista do dia (esperando você, trabalhando, terminadas hoje) e a conversa de cada tarefa, lida pela thread dela, dentro do orçamento diário do agentes.chat.
- **Modo resposta** opcional (`"conversas": "responder"`, desligado por padrão): mandar mensagens nas conversas diretas do dia, com a permissão "ler e mandar tarefas", senha uma vez, modo de 1 hora (teto de 8 horas) por navegador, limites, registro sem conteúdo e proteção contra envio duplicado.
- **Expediente** no **Personalizar**, com faixa e placa no mapa, inclusive turno que vira a meia-noite.
- Demonstração animada no topo dos READMEs, com imagem parada para quem prefere menos movimento.

### Mudado
- O mapa em tela cheia passa a começar abaixo da faixa do topo, para os controles não ficarem cobertos.
- Testes isolados dos arquivos locais; prints da documentação refeitos.

### Removido
- A maquete 3D e o three.js.

## 2026-11-04 · Primeira versão pública

Commit [`54c329b`](https://github.com/HelbertMoura/escritorio-agentes/commit/54c329b).

### Adicionado
- Escritório em pixel art, ao vivo, para os agentes do agentes.chat: mapa procedural de 1 a 20 times, vida e sons dos agentes, aprovações com o histórico do dia, personalização da marca, simulação de data, hora e clima, maquete 3D, modo foto e modo demonstração.
- Servidor em Python (só a biblioteca padrão), alcançável só pela tailnet, com código de primeiro acesso de uso único e falha fechada quando o arquivo de usuários não pode ser lido.
- Licença AGPL-3.0-or-later.
