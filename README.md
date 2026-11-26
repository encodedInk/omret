# omret

Clone de **termo**, **dueto** e **quarteto** com **palavras de cinco letras**: as respostas vêm da [`biblioteca.json`](biblioteca.json) (com significado) e os palpites aceitos incluem também as mais de 18 mil palavras de [`aceitas.txt`](aceitas.txt). O nome é "termo" ao contrário.

O jogo é 100% estático: HTML, CSS e JavaScript puro, sem dependências e sem build.

## Rodar

```bash
npm start
# abre em http://localhost:4173
```

Também funciona abrindo `index.html` direto no navegador. O servidor local é recomendado porque a API de área de transferência (botão "Compartilhar") exige um contexto seguro.

## GitHub Pages

O site é publicado automaticamente no GitHub Pages via [GitHub Actions](.github/workflows/deploy.yml) a cada push na branch `main`. Não é necessário build: o projeto é 100% estático.

O deploy é acionado automaticamente, mas também pode ser disparado manualmente na aba "Actions" do repositório.


## Modalidades

| modalidade | palavras | tentativas |
| --- | --- | --- |
| termo | 1 | 6 |
| dueto | 2 | 7 |
| quarteto | 4 | 9 |

Cada palpite vale para **todos os tabuleiros que ainda estão em jogo**. Quando uma palavra é descoberta, o tabuleiro dela para de receber palpites e mostra a linha vencedora. O teclado combina as dicas de todos os tabuleiros (verde > amarelo > cinza).

Há dois tipos de rodada:

- **Diário:** uma rodada por dia e modalidade, com as mesmas palavras para todo mundo.
- **Prática:** não muda com a data. A rodada continua até ser concluída; ao terminar, o contador de acertos e erros é atualizado e uma nova prática começa.

## Regras e detalhes

- Depois de cada palpite, verde = letra certa na posição certa; amarelo = letra existe em outra posição; cinza = letra ausente.
- Acentos e cedilha são preenchidos automaticamente e não contam nas dicas: `açude` vale como `acude`.
- Palavras podem ter letras repetidas.
- No **diário**, **uma palavra nunca é sorteada duas vezes na mesma modalidade** até a lista de respostas dar a volta. Cada modalidade tem uma ordem fixa das respostas (embaralhada com semente constante) e cada dia avança nela; nada depende do histórico do navegador.
- No **modo prática**, cada palavra tem um intervalo de **90 dias** antes de poder ser sorteada de novo. Dentro da mesma prática não há repetição.
- O modo prática tem um contador próprio por modalidade: **palavras certas**, **palavras erradas** e práticas concluídas. Em dueto e quarteto, cada palavra resolvida conta como acerto e cada palavra não resolvida conta como erro.
- Os palpites precisam estar na `biblioteca.json` ou em `aceitas.txt` e não podem repetir um palpite já feito na rodada. Em **Como jogar → Ver as palavras aceitas** dá para listar as palavras com significado e conferir se qualquer palavra é aceita.
- Nem toda palavra aceita pode ser sorteada: flexões verbais, siglas, nomes próprios, variantes e formas antigas valem só como palpite (veja *Atualizar a biblioteca*).
- O switch "prática" (ou o botão ↻ no diário) leva ao modo prática; o diário fica salvo e acessível pelo link "voltar ao diário".
- Estatísticas (jogos, vitórias, sequência, recorde e distribuição de tentativas) são guardadas por modalidade e contam **só o diário**. A sequência zera quando um dia fica sem vitória. O painel também mostra o contador do modo prática; abandonar uma prática em andamento conta as palavras não resolvidas como erros.
- O resultado pode ser compartilhado como uma grade de emojis.
- O tema claro/escuro acompanha o sistema e pode ser alternado no botão de sol/lua.

## Estrutura

```
index.html                    interface
css/estilo.css                estilos, temas e animações
js/palavras.js                palavras geradas a partir da biblioteca e de aceitas.txt
js/jogo.js                    regras, sorteio, persistência e interface
ferramentas/gerar-palavras.mjs  gerador de js/palavras.js
ferramentas/gerar-aceitas.mjs   gerador de aceitas.txt (a partir do Hunspell pt_BR)
servidor.mjs                  servidor estático mínimo (sem dependências)
biblioteca.json               respostas, com significado
aceitas.txt                   palpites extras (dicionário VERO, LGPLv3/MPL)
```

## Atualizar a biblioteca

Há duas listas:

- **`biblioteca.json`** — respostas que podem ser sorteadas, cada uma com significado. Para ampliar as respostas, acrescente entradas aqui.
- **`aceitas.txt`** — palavras que só valem como palpite, uma por linha, sem acentos. Vem do dicionário pt_BR do [VERO](https://pt-br.libreoffice.org/projetos/vero) (o mesmo do LibreOffice), sob LGPLv3/MPL. Para aceitar uma palavra que falta, escreva-a depois da linha `# --- extras ---` no fim do arquivo.

Para recriar `aceitas.txt` a partir do dicionário instalado no sistema (precisa de `unmunch`, do pacote hunspell-tools, e do dicionário pt_BR):

```bash
npm run aceitas
```

Depois de mudar qualquer uma das listas, regenere a lista usada pelo jogo (o deploy também faz isso automaticamente):

```bash
npm run palavras
```

O gerador valida cada entrada (cinco letras `a-z` depois de remover acentos), remove duplicatas e ordena as palavras. Quando duas grafias têm a mesma forma sem acento (ex.: `abace`/`abacé`), fica a primeira e o gerador avisa quais foram descartadas.

Entradas cujo significado começa com "Flexão de", "Sigla", "Cidade", "Município", "Estado do/da", "País", "Povo", "Nome feminino/masculino/próprio", "Variante", "Forma antiga/afrancesada" ou "Palavra antiga" são marcadas com `0` em `js/palavras.js`: continuam aceitas como palpite, mas nunca são sorteadas. A regra fica em `NAO_RESPOSTA`, no gerador.

Mudar a lista de respostas muda a ordem do diário a partir do dia seguinte (a rodada já começada no dia continua valendo).

## Dados locais

O jogo não tem back-end. As rodadas em andamento, as estatísticas e o modo prática (sorteios, contador e data de liberação de cada palavra) ficam no `localStorage`. Limpar os dados do navegador apaga esse histórico.
