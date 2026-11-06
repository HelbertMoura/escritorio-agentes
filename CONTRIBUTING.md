# Contributing · Como contribuir

[English](#english) · [Português (Brasil)](#português-brasil)

## English

Thanks for helping! Bug reports, ideas, art and code are all welcome.

### Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](./SECURITY.md), never a public issue.
- By taking part you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

### How the project is built

- **Server:** Python 3.10+ standard library only. Please do not add dependencies.
- **Front-end:** vanilla JavaScript and canvas, with no build step and no framework. New static files must be added to `ARQUIVOS` in `escritorio.py` (the server only serves a closed list).
- **Keep it simple:** small, readable changes in the style of the surrounding code. No mock or half-finished code.
- **No real data:** never commit real workspace data, organization ids, agent names, tokens or screenshots of a real office. Use demo mode (`?demo=1`) or fictional data.

### Run it locally

```bash
ESCRITORIO_TIMES=times.exemplo.json python ferramentas/previa.py ferramentas/previa.exemplo.json   # preview at http://127.0.0.1:7372, no login
```

`ferramentas/previa.exemplo.json` holds MCP responses (`agents` and `tasks`) with fictional data. To test with your own workspace, copy its responses to `dados.json`, which git ignores. See the [README](./README.md#development).

### Before opening a pull request

```bash
python -B -I -m unittest discover -p "test_*.py"   # every test (test_escritorio and test_planta)
python -B ferramentas/checar_seguranca.py .
node --check static/<file you changed>.js
node ferramentas/checar_planta_mapa.mjs [url]   # if you changed mapa.js or the construction mode, with the preview running
bash -n instalar.sh   # if you changed the installer
```

- Add a test when it adds real value (a bug that could come back, a security rule).
- Update both READMEs (`README.md` and `README.pt-BR.md`) if you change behavior or setup.
- Changes to login, sessions, OAuth, the data folder or `instalar.sh` get a closer security review.

### License

This project is licensed under the [GNU AGPL-3.0](./LICENSE). By contributing, you agree that your contribution is released under the same license.

## Português (Brasil)

Obrigado pela ajuda! Relatos de bug, ideias, arte e código são todos bem-vindos.

### Antes de começar

- Para algo maior que um ajuste pequeno, abra uma issue antes, para combinarmos o caminho.
- Problemas de segurança vão pelo [SECURITY.md](./SECURITY.md), nunca por issue pública.
- Ao participar, você concorda em seguir o [Código de Conduta](./CODE_OF_CONDUCT.md).

### Como o projeto é feito

- **Servidor:** só a biblioteca padrão do Python 3.10+. Por favor, não acrescente dependências.
- **Front-end:** JavaScript puro e canvas, sem build e sem framework. Arquivo estático novo precisa entrar em `ARQUIVOS`, no `escritorio.py` (o servidor só serve uma lista fechada).
- **Simplicidade:** mudanças pequenas e legíveis, no estilo do código ao redor. Nada de código de mentira ou pela metade.
- **Nada de dados reais:** nunca envie dados de um workspace real, ids de organização, nomes de agentes, tokens ou prints de um escritório real. Use o modo demonstração (`?demo=1`) ou dados fictícios.

### Rodar na sua máquina

```bash
ESCRITORIO_TIMES=times.exemplo.json python ferramentas/previa.py ferramentas/previa.exemplo.json   # prévia em http://127.0.0.1:7372, sem login
```

O `ferramentas/previa.exemplo.json` traz respostas do MCP (`agents` e `tasks`) com dados fictícios. Para testar com o seu workspace, copie as respostas dele para `dados.json`, que o git ignora. Veja o [README](./README.pt-BR.md#desenvolvimento).

### Antes de abrir um pull request

```bash
python -B -I -m unittest discover -p "test_*.py"   # todos os testes (test_escritorio e test_planta)
python -B ferramentas/checar_seguranca.py .
node --check static/<arquivo que você mudou>.js
node ferramentas/checar_planta_mapa.mjs [url]   # se mudou o mapa.js ou o modo construção, com a prévia no ar
bash -n instalar.sh   # se mudou o instalador
```

- Acrescente teste quando ele agregar valor de verdade (um bug que pode voltar, uma regra de segurança).
- Atualize os dois READMEs (`README.md` e `README.pt-BR.md`) se mudar comportamento ou instalação.
- Mudanças em login, sessões, OAuth, pasta de dados ou `instalar.sh` passam por uma revisão de segurança mais cuidadosa.

### Licença

Este projeto usa a [GNU AGPL-3.0](./LICENSE). Ao contribuir, você concorda que a sua contribuição sai sob a mesma licença.
