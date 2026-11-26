/* ==========================================================================
   omret — termo, dueto e quarteto
   Regras: 1 palavra em 6 tentativas, 2 em 7, 4 em 9.
   Diário: o mesmo para todos (derivado da data), sem repetição até a
   lista de respostas dar a volta.
   Prática: cada palavra pode voltar depois de 90 dias.
   ========================================================================== */

(() => {
  'use strict';

  const TAMANHO = 5;
  const CHAVE_ARMAZEM = 'omret.v1';
  const DIAS_PRATICA = 90;
  const MS_DIA = 24 * 60 * 60 * 1000;
  const EMOJI = { certa: '🟩', presente: '🟨', ausente: '⬛' };
  const PESO = { ausente: 1, presente: 2, certa: 3 };
  const ROTULO_ESTADO = {
    certa: 'posição certa',
    presente: 'existe em outra posição',
    ausente: 'não faz parte da palavra',
  };

  const MODOS = {
    termo: { nome: 'termo', tabuleiros: 1, tentativas: 6 },
    dueto: { nome: 'dueto', tabuleiros: 2, tentativas: 7 },
    quarteto: { nome: 'quarteto', tabuleiros: 4, tentativas: 9 },
  };

  const BIBLIOTECA = (window.OMRET_PALAVRAS || []).map(([com, sem, significado, resposta]) => ({
    com,
    sem,
    significado,
    resposta: resposta !== 0,
  }));
  const POR_PALAVRA = new Map(BIBLIOTECA.map((p) => [p.sem, p]));
  // Palavras sem significado que só valem como palpite (de aceitas.txt).
  const ACEITAS = String(window.OMRET_ACEITAS || '').split(' ').filter(Boolean);
  const DICIONARIO = new Set([...BIBLIOTECA.map((p) => p.sem), ...ACEITAS]);
  // Palavras que podem ser sorteadas; as demais só valem como palpite.
  const RESPOSTAS = BIBLIOTECA.filter((p) => p.resposta);

  const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURACAO_VIRAR = 440;
  const ATRASO_CELULA = 55;
  const ATRASO_TABULEIRO = 30;

  /* ------------------------------------------------------------------------
     Elementos
     ------------------------------------------------------------------------ */

  const el = {
    tabuleiros: document.getElementById('tabuleiros'),
    teclado: document.getElementById('teclado'),
    selo: document.getElementById('seloRodada'),
    status: document.getElementById('statusTexto'),
    btnModoPratica: document.getElementById('btnModoPratica'),
    btnDiario: document.getElementById('btnDiario'),
    btnVerResultado: document.getElementById('btnVerResultado'),
    btnNovo: document.getElementById('btnNovo'),
    btnAjuda: document.getElementById('btnAjuda'),
    btnEstatisticas: document.getElementById('btnEstatisticas'),
    btnTema: document.getElementById('btnTema'),
    btnBiblioteca: document.getElementById('btnBiblioteca'),
    btnCompartilhar: document.getElementById('btnCompartilhar'),
    btnBaixarImagem: document.getElementById('btnBaixarImagem'),
    btnNovoResultado: document.getElementById('btnNovoResultado'),
    placarPratica: document.getElementById('placarPratica'),
    aviso: document.getElementById('aviso'),
    dlgAjuda: document.getElementById('dlgAjuda'),
    dlgEstatisticas: document.getElementById('dlgEstatisticas'),
    dlgResultado: document.getElementById('dlgResultado'),
    dlgBiblioteca: document.getElementById('dlgBiblioteca'),
    dlgConfirmar: document.getElementById('dlgConfirmar'),
    confirmacaoMensagem: document.getElementById('confirmacaoMensagem'),
    btnConfirmarOk: document.getElementById('btnConfirmarOk'),
    btnConfirmarCancelar: document.getElementById('btnConfirmarCancelar'),
    buscaPalavra: document.getElementById('buscaPalavra'),
    listaPalavras: document.getElementById('listaPalavras'),
    contagemBiblioteca: document.getElementById('contagemBiblioteca'),
    bibliotecaVazia: document.getElementById('bibliotecaVazia'),
    tituloResultado: document.getElementById('tituloResultado'),
    resultadoResumo: document.getElementById('resultadoResumo'),
    resultadoPalavras: document.getElementById('resultadoPalavras'),
    anuncio: document.getElementById('anuncio'),
  };

  /* ------------------------------------------------------------------------
     Estado persistido
     ------------------------------------------------------------------------ */

  function estadoInicial() {
    return {
      modo: 'termo',
      tema: null,
      jogos: {},
      ativos: {},
      estatisticas: {},
      pratica: {},
      modoPratica: false,
    };
  }

  function carregarDados() {
    const base = estadoInicial();
    try {
      const texto = localStorage.getItem(CHAVE_ARMAZEM);
      if (!texto) return base;
      const salvo = JSON.parse(texto);
      if (!salvo || typeof salvo !== 'object') return base;

      return {
        modo: MODOS[salvo.modo] ? salvo.modo : 'termo',
        tema: salvo.tema === 'claro' || salvo.tema === 'escuro' ? salvo.tema : null,
        jogos: salvo.jogos && typeof salvo.jogos === 'object' ? salvo.jogos : {},
        ativos: salvo.ativos && typeof salvo.ativos === 'object' ? salvo.ativos : {},
        estatisticas: salvo.estatisticas && typeof salvo.estatisticas === 'object' ? salvo.estatisticas : {},
        pratica: salvo.pratica && typeof salvo.pratica === 'object' && !Array.isArray(salvo.pratica) ? salvo.pratica : {},
        modoPratica: salvo.modoPratica === true,
      };
    } catch {
      return base;
    }
  }

  let dados = carregarDados();

  // Remove as rodadas "livres" da versão anterior: só existem diário e prática.
  Object.keys(dados.jogos).forEach((chave) => {
    if (chave.endsWith(':livre')) delete dados.jogos[chave];
  });
  Object.keys(dados.ativos).forEach((modo) => {
    if (dados.ativos[modo] !== 'pratica') dados.ativos[modo] = 'diario';
  });

  // Sincroniza o switch de prática com o modo ativo, nos dois sentidos.
  if (dados.ativos[dados.modo] === 'pratica') dados.modoPratica = true;
  if (dados.modoPratica) dados.ativos[dados.modo] = 'pratica';

  // Palpite em edição: uma posição por letra, '' para vazia.
  let letras = Array(TAMANHO).fill('');
  let letraSelecionada = '';
  let cursorPos = 0;
  let bloqueado = false;
  let geracao = 0;
  let diaAtual = hoje();
  let avisoTimer = 0;
  // Rodada que acabou de terminar e cujo resultado ainda não foi exibido.
  // Enquanto estiver aqui, a prática não avança para a próxima rodada.
  let resultadoPendente = null;

  function salvar() {
    try {
      localStorage.setItem(CHAVE_ARMAZEM, JSON.stringify(dados));
    } catch {
      /* armazenamento indisponível: o jogo continua, sem salvar */
    }
  }

  /* ------------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------------ */

  function formatarData(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function hoje() {
    return formatarData(new Date());
  }

  function diaAnterior(iso) {
    const [ano, mes, dia] = String(iso).split('-').map(Number);
    return formatarData(new Date(ano, mes - 1, dia - 1));
  }

  // Número de dias corridos desde 1970-01-01 para uma data local AAAA-MM-DD.
  function numeroDoDia(iso) {
    const [ano, mes, dia] = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(ano, mes - 1, dia) / MS_DIA);
  }

  function dataCurta(iso) {
    const partes = String(iso).split('-');
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function normalizar(texto) {
    return String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ç/g, 'c')
      .replace(/Ç/g, 'C')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }

  function hashTexto(texto) {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function criarRng(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function embaralhar(lista, rng) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function descreverQtd(n) {
    if (n === 1) return 'uma palavra';
    if (n === 2) return 'duas palavras';
    return `${n} palavras`;
  }

  function avaliar(palpite, alvo) {
    const resultado = Array(TAMANHO).fill('ausente');
    const restantes = {};

    for (let i = 0; i < TAMANHO; i++) {
      if (palpite[i] === alvo[i]) {
        resultado[i] = 'certa';
      } else {
        restantes[alvo[i]] = (restantes[alvo[i]] || 0) + 1;
      }
    }

    for (let i = 0; i < TAMANHO; i++) {
      if (resultado[i] === 'certa') continue;
      const letra = palpite[i];
      if (restantes[letra] > 0) {
        resultado[i] = 'presente';
        restantes[letra] -= 1;
      }
    }

    return resultado;
  }

  function avisar(mensagem, duracao = 2400) {
    el.aviso.textContent = mensagem;
    el.aviso.classList.add('visivel');
    window.clearTimeout(avisoTimer);
    avisoTimer = window.setTimeout(() => el.aviso.classList.remove('visivel'), duracao);
  }

  /* ------------------------------------------------------------------------
     Sorteio das palavras
     ------------------------------------------------------------------------ */

  function obterPratica(modo) {
    const atual = dados.pratica[modo];
    const usos = {};

    if (atual && atual.usos && typeof atual.usos === 'object') {
      Object.entries(atual.usos).forEach(([palavra, quando]) => {
        const instante = Number(quando);
        if (typeof palavra === 'string' && Number.isFinite(instante)) {
          usos[palavra] = instante;
        }
      });
    }

    const pratica = {
      acertos: Math.max(0, Number(atual && atual.acertos) || 0),
      erros: Math.max(0, Number(atual && atual.erros) || 0),
      jogos: Math.max(0, Number(atual && atual.jogos) || 0),
      usos,
    };

    dados.pratica[modo] = pratica;
    return pratica;
  }

  function sortearPratica(modo) {
    const cfg = MODOS[modo];
    const pratica = obterPratica(modo);
    const agora = Date.now();
    const limite = agora - DIAS_PRATICA * MS_DIA;

    const liberadas = RESPOSTAS.filter((p) => {
      const usadoEm = pratica.usos[p.sem];
      return !usadoEm || usadoEm <= limite;
    });

    let escolhidas;

    if (liberadas.length >= cfg.tabuleiros) {
      escolhidas = embaralhar(liberadas, Math.random).slice(0, cfg.tabuleiros);
    } else {
      // Caso extremo: todas as palavras foram usadas há menos de 90 dias.
      // Completa com as mais antigas, sem repetir dentro da mesma rodada.
      const liberadasSem = new Set(liberadas.map((p) => p.sem));
      const restantes = RESPOSTAS
        .filter((p) => !liberadasSem.has(p.sem))
        .sort((a, b) => (pratica.usos[a.sem] || 0) - (pratica.usos[b.sem] || 0));

      escolhidas = liberadas.concat(restantes.slice(0, cfg.tabuleiros - liberadas.length));
    }

    const alvos = escolhidas.map((p) => p.sem);
    alvos.forEach((palavra) => {
      pratica.usos[palavra] = agora;
    });
    dados.pratica[modo] = pratica;

    return alvos;
  }

  // O diário não depende de nada guardado no navegador: cada modalidade tem
  // uma ordem fixa das respostas (embaralhada com semente constante) e cada
  // dia avança alguns passos nela. Assim todo mundo recebe as mesmas palavras
  // e nenhuma se repete até a lista inteira dar a volta.
  const ordemDiaria = {};

  function alvosDiario(modo, data) {
    const cfg = MODOS[modo];
    if (!ordemDiaria[modo]) {
      ordemDiaria[modo] = embaralhar(RESPOSTAS.map((p) => p.sem), criarRng(hashTexto(`omret|${modo}`)));
    }
    const ordem = ordemDiaria[modo];
    const inicio = (numeroDoDia(data) * cfg.tabuleiros) % ordem.length;
    return Array.from({ length: cfg.tabuleiros }, (_, i) => ordem[(inicio + i) % ordem.length]);
  }

  function criarJogo(modo, tipo) {
    const data = hoje();
    return {
      modo,
      tipo,
      data,
      criadoEm: Date.now(),
      alvos: tipo === 'pratica' ? sortearPratica(modo) : alvosDiario(modo, data),
      palpites: [],
      contabilizado: false,
    };
  }

  function jogoValido(jogo) {
    if (!jogo || !MODOS[jogo.modo]) return false;
    const cfg = MODOS[jogo.modo];
    if (!Array.isArray(jogo.alvos) || jogo.alvos.length !== cfg.tabuleiros) return false;
    if (new Set(jogo.alvos).size !== jogo.alvos.length) return false;
    // Não exige que o alvo ainda esteja na biblioteca: se ela for atualizada
    // no meio do dia, a rodada em andamento continua valendo.
    if (!jogo.alvos.every((a) => typeof a === 'string' && /^[a-z]{5}$/.test(a))) return false;
    if (!Array.isArray(jogo.palpites)) return false;

    return jogo.palpites.every((jogada) => (
      jogada
      && typeof jogada.palavra === 'string'
      && jogada.palavra.length === TAMANHO
      && Array.isArray(jogada.resultados)
      && jogada.resultados.length === cfg.tabuleiros
      && jogada.resultados.every((r) => Array.isArray(r) && r.length === TAMANHO)
    ));
  }

  // Devolve a rodada em jogo. Só cria uma rodada nova quando não há uma
  // válida (ou quando o diário virou o dia); nunca avança a prática sozinha,
  // para que funções de desenho possam chamá-la sem efeitos colaterais.
  function jogoAtual() {
    const modo = dados.modo;
    const tipo = dados.ativos[modo] === 'pratica' ? 'pratica' : 'diario';
    const chave = `${modo}:${tipo}`;
    let jogo = dados.jogos[chave];

    const invalido = !jogoValido(jogo) || jogo.modo !== modo || jogo.tipo !== tipo;
    if (invalido || (tipo === 'diario' && jogo.data !== hoje())) {
      jogo = criarJogo(modo, tipo);
      dados.jogos[chave] = jogo;
      dados.ativos[modo] = tipo;
      salvar();
    }

    return jogo;
  }

  // A prática não muda com o dia: a próxima rodada só é sorteada quando a
  // anterior terminou e o resultado já foi exibido e fechado. Se a página foi
  // recarregada antes da contagem, ela é feita aqui.
  function avancarPraticaConcluida() {
    const modo = dados.modo;
    if (dados.ativos[modo] !== 'pratica' || el.dlgResultado.open) return;

    const chave = `${modo}:pratica`;
    const jogo = dados.jogos[chave];
    if (!jogoValido(jogo) || jogo.modo !== modo || jogo.tipo !== 'pratica') return;
    if (jogo === resultadoPendente || statusJogo(jogo) === 'jogando') return;

    if (!jogo.contabilizado) contabilizar(jogo, statusJogo(jogo) === 'ganhou');
    dados.jogos[chave] = criarJogo(modo, 'pratica');
    salvar();
  }

  function indiceResolucao(jogo, indice) {
    return jogo.palpites.findIndex((jogada) => jogada.palavra === jogo.alvos[indice]);
  }

  function statusJogo(jogo) {
    const cfg = MODOS[jogo.modo];
    if (jogo.alvos.every((_, i) => indiceResolucao(jogo, i) >= 0)) return 'ganhou';
    if (jogo.palpites.length >= cfg.tentativas) return 'perdeu';
    return 'jogando';
  }

  /* ------------------------------------------------------------------------
     Estatísticas
     ------------------------------------------------------------------------ */

  function obterEstatisticas(modo) {
    const cfg = MODOS[modo];
    const atual = dados.estatisticas[modo];
    const stats = {
      jogos: Number(atual && atual.jogos) || 0,
      vitorias: Number(atual && atual.vitorias) || 0,
      sequencia: Number(atual && atual.sequencia) || 0,
      recorde: Number(atual && atual.recorde) || 0,
      ultimaData: atual && typeof atual.ultimaData === 'string' ? atual.ultimaData : null,
      distribuicao: Array.from({ length: cfg.tentativas }, (_, i) => Number(atual && atual.distribuicao && atual.distribuicao[i]) || 0),
    };
    dados.estatisticas[modo] = stats;
    return stats;
  }

  function contabilizarPratica(jogo) {
    const pratica = obterPratica(jogo.modo);
    pratica.jogos += 1;

    jogo.alvos.forEach((_, indice) => {
      if (indiceResolucao(jogo, indice) >= 0) pratica.acertos += 1;
      else pratica.erros += 1;
    });

    dados.pratica[jogo.modo] = pratica;
  }

  // A prática tem contador próprio; as estatísticas (e a sequência) são só
  // do diário, para que não possam ser infladas abandonando práticas.
  function contabilizar(jogo, ganhou) {
    if (jogo.contabilizado) return;
    jogo.contabilizado = true;

    if (jogo.tipo === 'pratica') {
      contabilizarPratica(jogo);
      salvar();
      return;
    }

    const stats = obterEstatisticas(jogo.modo);
    stats.jogos += 1;

    if (ganhou) {
      stats.vitorias += 1;
      // A sequência só continua se a última vitória foi no dia anterior.
      const continua = !stats.ultimaData || stats.ultimaData === diaAnterior(jogo.data);
      stats.sequencia = continua ? stats.sequencia + 1 : 1;
      stats.recorde = Math.max(stats.recorde, stats.sequencia);
      const indice = jogo.palpites.length - 1;
      if (indice >= 0 && indice < stats.distribuicao.length) stats.distribuicao[indice] += 1;
    } else {
      stats.sequencia = 0;
    }
    stats.ultimaData = jogo.data;

    dados.estatisticas[jogo.modo] = stats;
    salvar();
  }

  // Sequência que vale hoje: zera se um dia passou sem diário concluído.
  function sequenciaAtual(stats) {
    if (!stats.ultimaData) return stats.sequencia;
    const agora = hoje();
    return stats.ultimaData === agora || stats.ultimaData === diaAnterior(agora) ? stats.sequencia : 0;
  }

  function renderizarEstatisticas(modo) {
    const stats = obterEstatisticas(modo);
    document.getElementById('statsModo').textContent = modo;
    document.getElementById('statJogos').textContent = String(stats.jogos);
    document.getElementById('statVitorias').textContent = stats.jogos
      ? `${Math.round((stats.vitorias / stats.jogos) * 100)}%`
      : '0%';
    document.getElementById('statSequencia').textContent = String(sequenciaAtual(stats));
    document.getElementById('statRecorde').textContent = String(stats.recorde);

    const pratica = obterPratica(modo);
    document.getElementById('statPraticaAcertos').textContent = String(pratica.acertos);
    document.getElementById('statPraticaErros').textContent = String(pratica.erros);
    document.getElementById('statPraticaJogos').textContent = String(pratica.jogos);

    const container = document.getElementById('distribuicao');
    container.innerHTML = '';
    const maximo = Math.max(1, ...stats.distribuicao);

    stats.distribuicao.forEach((quantidade, indice) => {
      const linha = document.createElement('div');
      linha.className = 'dist-linha';

      const numero = document.createElement('span');
      numero.className = 'dist-num';
      numero.textContent = String(indice + 1);

      const barra = document.createElement('div');
      barra.className = 'dist-barra';

      const preenchida = document.createElement('div');
      preenchida.className = 'dist-preenchida';
      preenchida.textContent = String(quantidade);
      if (quantidade > 0) {
        preenchida.style.width = `${Math.max((quantidade / maximo) * 100, 8)}%`;
      } else {
        preenchida.classList.add('vazia');
        preenchida.style.width = '22px';
      }

      barra.appendChild(preenchida);
      linha.append(numero, barra);
      container.appendChild(linha);
    });
  }

  /* ------------------------------------------------------------------------
     Desenho do jogo
     ------------------------------------------------------------------------ */

  function criarTabuleiro(jogo, indice) {
    const cfg = MODOS[jogo.modo];
    const bloco = document.createElement('section');
    bloco.className = 'tabuleiro';
    bloco.dataset.indice = String(indice);

    if (jogo.alvos.length > 1) {
      const rotulo = document.createElement('span');
      rotulo.className = 'rotulo-tabuleiro';
      rotulo.textContent = `palavra ${indice + 1}`;
      bloco.appendChild(rotulo);
    }

    bloco.setAttribute('aria-label', `Palavra ${indice + 1} de ${jogo.alvos.length}`);

    const grade = document.createElement('div');
    grade.className = 'grade';
    const resolvidoEm = indiceResolucao(jogo, indice);

    for (let linha = 0; linha < cfg.tentativas; linha++) {
      const elementosLinha = document.createElement('div');
      elementosLinha.className = 'linha-tabuleiro';
      const revelada = linha < jogo.palpites.length && (resolvidoEm < 0 || linha <= resolvidoEm);

      for (let coluna = 0; coluna < TAMANHO; coluna++) {
        const celula = document.createElement('div');
        celula.className = 'celula';
        // Leitores de tela leem a linha inteira pelo rótulo do grupo.
        celula.setAttribute('aria-hidden', 'true');

        if (revelada) {
          const jogada = jogo.palpites[linha];
          celula.textContent = jogada.palavra[coluna];
          celula.dataset.estado = jogada.resultados[indice][coluna];
        }

        elementosLinha.appendChild(celula);
      }

      if (revelada) rotularLinha(elementosLinha, jogo.palpites[linha], indice, linha);
      grade.appendChild(elementosLinha);
    }

    bloco.appendChild(grade);
    return bloco;
  }

  function descreverResultado(jogada, indice) {
    return jogada.resultados[indice]
      .map((estado, coluna) => `${jogada.palavra[coluna].toUpperCase()} ${ROTULO_ESTADO[estado]}`)
      .join(', ');
  }

  function rotularLinha(linhaEl, jogada, indice, numero) {
    linhaEl.setAttribute('role', 'group');
    linhaEl.setAttribute('aria-label', `Tentativa ${numero + 1}: ${descreverResultado(jogada, indice)}`);
  }

  function renderizarTudo() {
    avancarPraticaConcluida();
    const jogo = jogoAtual();
    geracao += 1;
    bloqueado = false;
    letraSelecionada = '';
    atualizarSelecaoTeclado();

    document.body.dataset.modo = jogo.modo;
    document.body.dataset.tipo = jogo.tipo;

    document.querySelectorAll('.modo').forEach((botao) => {
      botao.setAttribute('aria-pressed', String(botao.dataset.modo === jogo.modo));
    });
    el.btnModoPratica.setAttribute('aria-checked', String(dados.modoPratica));

    el.tabuleiros.dataset.tabuleiros = String(MODOS[jogo.modo].tabuleiros);
    el.tabuleiros.innerHTML = '';
    jogo.alvos.forEach((_, indice) => {
      el.tabuleiros.appendChild(criarTabuleiro(jogo, indice));
    });

    letras = Array(TAMANHO).fill('');
    cursorPos = 0;
    atualizarTeclado(jogo);
    atualizarStatus(jogo);
    renderizarPalpiteAtual();
  }

  function atualizarStatus(jogo) {
    const cfg = MODOS[jogo.modo];
    const status = statusJogo(jogo);
    const qtd = descreverQtd(jogo.alvos.length);

    const pratica = jogo.tipo === 'pratica';
    el.selo.textContent = pratica ? 'prática' : 'diário';
    el.selo.title = pratica
      ? 'Modo prática · nova rodada a cada jogo concluído'
      : `Diário de ${dataCurta(jogo.data)}`;

    const rotuloNovo = pratica ? 'Nova prática' : 'Jogar prática';
    el.btnNovo.title = rotuloNovo;
    el.btnNovo.setAttribute('aria-label', rotuloNovo);

    if (pratica) {
      const pratica = obterPratica(jogo.modo);
      const total = pratica.acertos + pratica.erros;
      const pctAcertos = total ? Math.round((pratica.acertos / total) * 100) : 0;
      const pctErros = total ? Math.round((pratica.erros / total) * 100) : 0;

      el.placarPratica.hidden = false;
      document.getElementById('placarAcertos').style.width = `${pctAcertos}%`;
      document.getElementById('placarErros').style.width = `${pctErros}%`;
      document.getElementById('placarTexto').textContent = `${pratica.acertos} ${pratica.acertos === 1 ? 'acerto' : 'acertos'} · ${pratica.erros} ${pratica.erros === 1 ? 'erro' : 'erros'}`;
    } else {
      el.placarPratica.hidden = true;
    }

    if (status === 'jogando') {
      el.status.textContent = `${qtd} · ${jogo.palpites.length} de ${cfg.tentativas} tentativas`;
    } else if (status === 'ganhou') {
      el.status.textContent = `${qtd} · resolvido em ${jogo.palpites.length} de ${cfg.tentativas}`;
    } else {
      el.status.textContent = `${qtd} · não resolvido`;
    }

    el.btnDiario.hidden = jogo.tipo === 'diario';
    el.btnVerResultado.hidden = status === 'jogando';
  }

  function atualizarTeclado(jogo) {
    const estados = {};

    jogo.alvos.forEach((_, indiceTabuleiro) => {
      const resolvidoEm = indiceResolucao(jogo, indiceTabuleiro);
      const limite = resolvidoEm >= 0 ? resolvidoEm : jogo.palpites.length - 1;

      for (let i = 0; i <= limite; i++) {
        const jogada = jogo.palpites[i];
        for (let c = 0; c < TAMANHO; c++) {
          const letra = jogada.palavra[c];
          const estado = jogada.resultados[indiceTabuleiro][c];
          if (!estados[letra] || PESO[estado] > PESO[estados[letra]]) {
            estados[letra] = estado;
          }
        }
      }
    });

    el.teclado.querySelectorAll('.tecla[data-letra]').forEach((botao) => {
      const estado = estados[botao.dataset.letra];
      if (estado) botao.dataset.estado = estado;
      else delete botao.dataset.estado;
    });
  }

  // Desenha o palpite em edição. `colunaPulso` é a célula que acabou de
  // receber uma letra e deve pulsar (-1 para nenhuma).
  function renderizarPalpiteAtual(colunaPulso = -1) {
    const jogo = jogoAtual();
    if (statusJogo(jogo) !== 'jogando') return;

    const numeroLinha = jogo.palpites.length;

    el.tabuleiros.querySelectorAll('.tabuleiro').forEach((bloco) => {
      const indice = Number(bloco.dataset.indice);
      if (indiceResolucao(jogo, indice) >= 0) return;

      const linha = bloco.querySelectorAll('.grade .linha-tabuleiro')[numeroLinha];
      if (!linha) return;

      for (let c = 0; c < TAMANHO; c++) {
        const celula = linha.children[c];
        const letra = letras[c];
        if (celula.textContent !== letra) celula.textContent = letra;
        celula.classList.toggle('preenchida', letra !== '');
        celula.removeAttribute('data-estado');

        if (c === colunaPulso) {
          celula.classList.remove('pulso');
          void celula.offsetWidth;
          celula.classList.add('pulso');
          window.setTimeout(() => celula.classList.remove('pulso'), 150);
        }
      }
    });

    atualizarCursorVisual();
  }

  function atualizarCursorVisual() {
    const jogo = jogoAtual();
    if (statusJogo(jogo) !== 'jogando') return;

    const numeroLinha = jogo.palpites.length;

    el.tabuleiros.querySelectorAll('.celula.cursor').forEach((celula) => {
      celula.classList.remove('cursor');
    });

    el.tabuleiros.querySelectorAll('.tabuleiro').forEach((bloco) => {
      const indice = Number(bloco.dataset.indice);
      if (indiceResolucao(jogo, indice) >= 0) return;

      const linhas = bloco.querySelectorAll('.grade .linha-tabuleiro');
      const linha = linhas[numeroLinha];
      if (!linha) return;

      const celula = linha.children[cursorPos];
      if (celula) celula.classList.add('cursor');
    });
  }

  function tremerLinha() {
    const jogo = jogoAtual();
    const numeroLinha = jogo.palpites.length;

    el.tabuleiros.querySelectorAll('.tabuleiro').forEach((bloco) => {
      const indice = Number(bloco.dataset.indice);
      if (indiceResolucao(jogo, indice) >= 0) return;
      const linha = bloco.querySelectorAll('.grade .linha-tabuleiro')[numeroLinha];
      if (!linha) return;
      [...linha.children].forEach((celula) => {
        celula.classList.remove('tremer');
        void celula.offsetWidth;
        celula.classList.add('tremer');
      });
    });

    window.setTimeout(() => {
      el.tabuleiros.querySelectorAll('.celula.tremer').forEach((celula) => celula.classList.remove('tremer'));
    }, 450);
  }

  function revelarJogada(jogo, indiceJogada, resolvidosAntes) {
    const jogada = jogo.palpites[indiceJogada];
    if (!jogada) return;

    el.tabuleiros.querySelectorAll('.tabuleiro').forEach((bloco) => {
      const indice = Number(bloco.dataset.indice);
      if (resolvidosAntes[indice]) return;

      const linha = bloco.querySelectorAll('.grade .linha-tabuleiro')[indiceJogada];
      if (!linha) return;

      [...linha.children].forEach((celula, coluna) => {
        celula.textContent = jogada.palavra[coluna];
        celula.dataset.estado = jogada.resultados[indice][coluna];
        celula.classList.remove('cursor');
        celula.classList.add('preenchida', 'virar');
        celula.style.setProperty('--atraso', `${coluna * ATRASO_CELULA + indice * ATRASO_TABULEIRO}ms`);
      });
      rotularLinha(linha, jogada, indice, indiceJogada);
    });
  }

  // Anuncia o resultado do palpite para leitores de tela.
  function anunciarJogada(jogo, jogada, resolvidosAntes) {
    const partes = [jogada.palavra.toUpperCase()];
    jogo.alvos.forEach((_, indice) => {
      if (resolvidosAntes[indice]) return;
      const descricao = descreverResultado(jogada, indice);
      partes.push(jogo.alvos.length > 1 ? `palavra ${indice + 1}: ${descricao}` : descricao);
    });
    el.anuncio.textContent = partes.join('. ');
  }

  function marcarVitorias(jogo) {
    jogo.alvos.forEach((_, indice) => {
      const resolvidoEm = indiceResolucao(jogo, indice);
      if (resolvidoEm < 0) return;

      const bloco = el.tabuleiros.querySelector(`.tabuleiro[data-indice="${indice}"]`);
      const linha = bloco && bloco.querySelectorAll('.grade .linha-tabuleiro')[resolvidoEm];
      if (!linha) return;

      [...linha.children].forEach((celula, coluna) => {
        celula.classList.remove('virar');
        celula.style.setProperty('--atraso', `${coluna * 45}ms`);
        celula.classList.add('vitoria');
      });
    });
  }

  function duracaoRevelacao(jogo, resolvidosAntes) {
    if (reduzirMovimento) return 0;
    let maiorTabuleiro = 0;
    jogo.alvos.forEach((_, indice) => {
      if (!resolvidosAntes[indice]) maiorTabuleiro = Math.max(maiorTabuleiro, indice);
    });
    return DURACAO_VIRAR + 4 * ATRASO_CELULA + maiorTabuleiro * ATRASO_TABULEIRO + 90;
  }

  /* ------------------------------------------------------------------------
     Jogadas
     ------------------------------------------------------------------------ */

  function teclar(tecla) {
    if (bloqueado) return;
    if (document.querySelector('dialog[open]')) return;

    const jogo = jogoAtual();
    if (statusJogo(jogo) !== 'jogando') return;

    if (tecla === 'enter') {
      letraSelecionada = '';
      atualizarSelecaoTeclado();
      enviarPalpite();
      piscarTecla('enter');
      return;
    }

    if (tecla === 'apagar') {
      // Apaga a letra sob o cursor; se a posição estiver vazia, recua e
      // apaga a anterior. As outras letras nunca mudam de lugar.
      piscarTecla('apagar');
      if (cursorPos < TAMANHO && letras[cursorPos]) {
        letras[cursorPos] = '';
      } else if (cursorPos > 0) {
        cursorPos -= 1;
        letras[cursorPos] = '';
      }
      letraSelecionada = '';
      atualizarSelecaoTeclado();
      renderizarPalpiteAtual();
      return;
    }

    if (tecla === 'ArrowLeft') {
      cursorPos = Math.max(0, cursorPos - 1);
      atualizarCursorVisual();
      return;
    }

    if (tecla === 'ArrowRight') {
      cursorPos = Math.min(TAMANHO, cursorPos + 1);
      atualizarCursorVisual();
      return;
    }

    if (/^[a-z]$/.test(tecla)) {
      // Cursor depois da última posição: não há onde escrever.
      if (cursorPos >= TAMANHO) return;

      const coluna = cursorPos;
      letras[coluna] = tecla;
      // Avança para a próxima posição vazia (ou para o fim).
      let proxima = coluna + 1;
      while (proxima < TAMANHO && letras[proxima]) proxima += 1;
      cursorPos = proxima;

      letraSelecionada = tecla;
      renderizarPalpiteAtual(coluna);
      piscarTecla(tecla);
      atualizarSelecaoTeclado();
    }
  }

  function enviarPalpite() {
    if (bloqueado) return;

    const jogo = jogoAtual();
    if (statusJogo(jogo) !== 'jogando') return;

    if (!letras.every(Boolean)) {
      avisar('Preencha as cinco letras.');
      tremerLinha();
      return;
    }

    const palavra = letras.join('');

    if (!DICIONARIO.has(palavra)) {
      avisar('Essa palavra não é aceita.');
      tremerLinha();
      return;
    }

    if (jogo.palpites.some((jogada) => jogada.palavra === palavra)) {
      avisar('Você já tentou essa palavra.');
      tremerLinha();
      return;
    }

    const resolvidosAntes = jogo.alvos.map((_, indice) => indiceResolucao(jogo, indice) >= 0);
    const resultados = jogo.alvos.map((alvo) => avaliar(palavra, alvo));

    jogo.palpites.push({ palavra, resultados });
    letras = Array(TAMANHO).fill('');
    cursorPos = 0;
    bloqueado = true;
    // Se a rodada terminou, o resultado precisa ser exibido antes de a
    // prática poder avançar (ver avancarPraticaConcluida).
    if (statusJogo(jogo) !== 'jogando') resultadoPendente = jogo;
    salvar();

    atualizarStatus(jogo);
    revelarJogada(jogo, jogo.palpites.length - 1, resolvidosAntes);

    const minhaGeracao = geracao;
    const espera = duracaoRevelacao(jogo, resolvidosAntes);

    window.setTimeout(() => {
      if (minhaGeracao !== geracao) return;

      atualizarTeclado(jogo);
      marcarVitorias(jogo);
      anunciarJogada(jogo, jogo.palpites[jogo.palpites.length - 1], resolvidosAntes);

      const status = statusJogo(jogo);

      if (status !== 'jogando') {
        // Continua bloqueado até o resultado abrir.
        contabilizar(jogo, status === 'ganhou');
        atualizarStatus(jogo);
        window.setTimeout(() => {
          if (minhaGeracao !== geracao) return;
          bloqueado = false;
          abrirResultado(jogo);
        }, reduzirMovimento ? 0 : 360);
      } else {
        bloqueado = false;
        renderizarPalpiteAtual();
      }
    }, espera);
  }

  /* ------------------------------------------------------------------------
     Resultado e compartilhamento
     ------------------------------------------------------------------------ */

  function abrirResultado(jogo) {
    const status = statusJogo(jogo);
    const ganhou = status === 'ganhou';
    const cfg = MODOS[jogo.modo];
    const origem = jogo.tipo === 'pratica' ? 'prática' : `diário de ${dataCurta(jogo.data)}`;
    if (resultadoPendente === jogo) resultadoPendente = null;

    el.tituloResultado.textContent = ganhou ? 'Mandou bem!' : 'Quase lá';
    el.btnNovoResultado.textContent = jogo.tipo === 'pratica' ? 'Nova prática' : 'Jogar prática';
    const fimDaFrase = jogo.alvos.length === 1 ? 'A palavra era:' : 'As palavras eram:';
    el.resultadoResumo.textContent = ganhou
      ? `${jogo.modo} · ${origem} · resolvido em ${jogo.palpites.length} de ${cfg.tentativas} tentativas.`
      : `${jogo.modo} · ${origem} · não foi dessa vez. ${fimDaFrase}`;

    el.resultadoPalavras.innerHTML = '';

    jogo.alvos.forEach((alvo, indice) => {
      const venceu = indiceResolucao(jogo, indice) >= 0;
      const grupo = document.createElement('div');
      grupo.className = 'resultado-grupo';

      if (jogo.alvos.length > 1) {
        const rotulo = document.createElement('span');
        rotulo.className = 'resultado-rotulo';
        rotulo.textContent = `palavra ${indice + 1}`;
        grupo.appendChild(rotulo);
      }

      const linha = document.createElement('div');
      linha.className = 'resultado-linha';
      const completa = (POR_PALAVRA.get(alvo) && POR_PALAVRA.get(alvo).com) || alvo;

      [...completa].forEach((letra) => {
        const celula = document.createElement('span');
        celula.className = 'celula';
        celula.dataset.estado = venceu ? 'certa' : 'ausente';
        celula.textContent = letra;
        linha.appendChild(celula);
      });

      grupo.appendChild(linha);

      const info = POR_PALAVRA.get(alvo);
      if (info?.significado) {
        const significado = document.createElement('p');
        significado.className = 'resultado-significado';
        significado.textContent = info.significado;
        grupo.appendChild(significado);
      }

      el.resultadoPalavras.appendChild(grupo);
    });

    if (!el.dlgResultado.open && typeof el.dlgResultado.showModal === 'function') {
      el.dlgResultado.showModal();
    }
  }

  function rotuloRodada(jogo) {
    return `${jogo.modo} · ${jogo.tipo === 'pratica' ? 'prática' : dataCurta(jogo.data)}`;
  }

  function textoCompartilhar(jogo) {
    const cfg = MODOS[jogo.modo];
    const ganhou = statusJogo(jogo) === 'ganhou';
    const linhas = [
      `omret · ${rotuloRodada(jogo)}`,
      ganhou
        ? `resolvido em ${jogo.palpites.length} de ${cfg.tentativas} tentativas`
        : `não resolvido em ${cfg.tentativas} tentativas`,
    ];

    jogo.alvos.forEach((_, indice) => {
      const resolvidoEm = indiceResolucao(jogo, indice);
      const limite = resolvidoEm >= 0 ? resolvidoEm : jogo.palpites.length - 1;
      linhas.push('');
      for (let i = 0; i <= limite; i++) {
        linhas.push(jogo.palpites[i].resultados[indice].map((estado) => EMOJI[estado]).join(''));
      }
    });

    return linhas.join('\n');
  }

  /* ------------------------------------------------------------------------
     Geração de imagem compartilhável (Canvas)
     ------------------------------------------------------------------------ */

  function lerCor(variavel, fallback) {
    const valor = getComputedStyle(document.documentElement)
      .getPropertyValue(variavel)
      .trim();
    return valor || fallback;
  }

  function corTextoCelula(estado) {
    return { certa: '#ffffff', presente: '#241c0c', ausente: '#ffffff' }[estado];
  }

  function fonte(peso, tamanho) {
    const familia = getComputedStyle(document.documentElement).getPropertyValue('--fonte').trim()
      || 'system-ui, sans-serif';
    return `${peso} ${tamanho}px ${familia}`;
  }

  // Equivalente a ctx.roundRect, que não existe no Safari anterior ao 16.
  function retanguloArredondado(ctx, x, y, largura, altura, raio) {
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
    ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
    ctx.arcTo(x, y + altura, x, y, raio);
    ctx.arcTo(x, y, x + largura, y, raio);
    ctx.closePath();
  }

  function quebrarTexto(ctx, texto, maximo) {
    const linhas = [];
    let linha = '';
    texto.split(' ').forEach((palavra) => {
      const teste = linha ? `${linha} ${palavra}` : palavra;
      if (linha && ctx.measureText(teste).width > maximo) {
        linhas.push(linha);
        linha = palavra;
      } else {
        linha = teste;
      }
    });
    if (linha) linhas.push(linha);
    return linhas;
  }

  // Desenha o resultado em coordenadas lógicas e devolve o tamanho usado.
  // É chamada duas vezes: uma para medir (num canvas descartável) e outra
  // para desenhar de fato, então a altura sempre corresponde ao conteúdo.
  function desenharResultado(ctx, jogo, cores) {
    const cfg = MODOS[jogo.modo];
    const ganhou = statusJogo(jogo) === 'ganhou';
    const C = 56;
    const G = 8;
    const P = 32;
    const ESPACO = 24;
    const W = P * 2 + C * TAMANHO + G * (TAMANHO - 1);
    let y = P;

    const texto = (conteudo, x, base, cor, fonteCss, alinhamento = 'left', linhaBase = 'alphabetic') => {
      ctx.fillStyle = cor;
      ctx.font = fonteCss;
      ctx.textAlign = alinhamento;
      ctx.textBaseline = linhaBase;
      ctx.fillText(conteudo, x, base);
    };

    texto('omret', P, y + 24, cores.texto, 'bold 24px Georgia, serif');
    y += 36;
    texto(rotuloRodada(jogo), P, y + 12, cores.textoFraco, fonte(400, 12));
    y += 28;
    texto(
      ganhou
        ? `resolvido em ${jogo.palpites.length} de ${cfg.tentativas} tentativas`
        : `não resolvido em ${cfg.tentativas} tentativas`,
      P, y + 16, cores.acento, fonte(700, 16),
    );
    y += 36;

    jogo.alvos.forEach((alvo, indice) => {
      const info = POR_PALAVRA.get(alvo);
      const completa = (info && info.com) || alvo;
      const resolvidoEm = indiceResolucao(jogo, indice);
      const limite = resolvidoEm >= 0 ? resolvidoEm : jogo.palpites.length - 1;

      if (jogo.alvos.length > 1) {
        texto(`palavra ${indice + 1}`, P, y + 10, cores.textoFraco, fonte(700, 10));
        y += 20;
      }

      for (let linha = 0; linha <= limite; linha++) {
        const jogada = jogo.palpites[linha];
        for (let coluna = 0; coluna < TAMANHO; coluna++) {
          const estado = jogada.resultados[indice][coluna];
          const x = P + coluna * (C + G);
          const yy = y + linha * (C + G);
          ctx.fillStyle = cores[estado];
          retanguloArredondado(ctx, x, yy, C, C, 7);
          ctx.fill();
          texto(jogada.palavra[coluna].toUpperCase(), x + C / 2, yy + C / 2 + 1,
            corTextoCelula(estado), fonte(700, 20), 'center', 'middle');
        }
      }
      y += (limite + 1) * (C + G) - G + 12;

      texto(completa.toUpperCase(), W / 2, y + 20, resolvidoEm >= 0 ? cores.certa : cores.textoFraco,
        fonte(700, 20), 'center');
      y += 32;

      if (info && info.significado) {
        ctx.font = fonte(400, 14);
        quebrarTexto(ctx, info.significado, W - P * 2).forEach((linhaTexto) => {
          texto(linhaTexto, W / 2, y, cores.textoFraco, fonte(400, 14), 'center', 'top');
          y += 18;
        });
      }

      y += ESPACO;
    });

    texto('omret — descubra palavras de cinco letras', W / 2, y + 11, cores.textoFraco, fonte(400, 11), 'center');
    y += 11 + P;

    return { largura: W, altura: Math.ceil(y) };
  }

  async function gerarImagemResultado(jogo) {
    const escala = 2;
    const cores = {
      fundo: lerCor('--fundo', '#f6f2e8'),
      texto: lerCor('--texto', '#201d18'),
      textoFraco: lerCor('--texto-fraco', '#746c5c'),
      acento: lerCor('--acento', '#0f6b55'),
      certa: lerCor('--certa', '#166534'),
      presente: lerCor('--presente', '#c2912b'),
      ausente: lerCor('--ausente', '#6f6859'),
    };

    const medida = desenharResultado(document.createElement('canvas').getContext('2d'), jogo, cores);

    const canvas = document.createElement('canvas');
    canvas.width = medida.largura * escala;
    canvas.height = medida.altura * escala;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = cores.fundo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(escala, escala);
    desenharResultado(ctx, jogo, cores);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Falha ao gerar a imagem.');
    return blob;
  }

  function nomeImagem(jogo) {
    return `omret-${jogo.modo}-${jogo.tipo === 'pratica' ? 'pratica-' : ''}${jogo.data.replace(/-/g, '')}.png`;
  }

  function baixarImagem(blob, nome) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function compartilhar() {
    const jogo = jogoAtual();

    // 1) Imagem pela folha de compartilhamento do sistema, se ela aceitar arquivos.
    let blob = null;
    try {
      blob = await gerarImagemResultado(jogo);
    } catch {
      blob = null; // sem imagem: segue para o texto
    }

    if (blob && navigator.share && navigator.canShare) {
      const arquivo = new File([blob], nomeImagem(jogo), { type: 'image/png' });
      if (navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: 'Resultado omret' });
          avisar('Resultado compartilhado.');
          return;
        } catch (erro) {
          // Usuário fechou a folha de compartilhamento: não faz mais nada.
          if (erro && erro.name === 'AbortError') return;
        }
      }
    }

    // 2) Senão, copia a grade de emojis.
    try {
      await copiarTexto(textoCompartilhar(jogo));
      el.btnCompartilhar.textContent = 'Copiado!';
      avisar('Resultado copiado.');
      window.setTimeout(() => {
        el.btnCompartilhar.textContent = 'Compartilhar';
      }, 1600);
    } catch {
      avisar('Não foi possível compartilhar o resultado.');
    }
  }

  async function baixarImagemResultado() {
    const jogo = jogoAtual();
    try {
      const blob = await gerarImagemResultado(jogo);
      baixarImagem(blob, nomeImagem(jogo));
      avisar('Imagem salva.');
    } catch {
      avisar('Não foi possível gerar a imagem.');
    }
  }

  async function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }

    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand('copy')) resolve();
        else reject(new Error('cópia indisponível'));
      } catch (erro) {
        reject(erro);
      } finally {
        area.remove();
      }
    });
  }

  /* ------------------------------------------------------------------------
     Nova rodada / diário / modalidades
     ------------------------------------------------------------------------ */

  function confirmar(mensagem) {
    return new Promise((resolve) => {
      el.confirmacaoMensagem.textContent = mensagem;
      let resultado = false;
      const aoOk = () => {
        resultado = true;
        el.dlgConfirmar.close();
      };
      const aoCancelar = () => el.dlgConfirmar.close();
      // Toda saída (botões, Esc, clique fora) passa pelo evento close, que
      // remove os ouvintes para não acumulá-los entre confirmações.
      const aoFechar = () => {
        el.btnConfirmarOk.removeEventListener('click', aoOk);
        el.btnConfirmarCancelar.removeEventListener('click', aoCancelar);
        resolve(resultado);
      };
      el.btnConfirmarOk.addEventListener('click', aoOk);
      el.btnConfirmarCancelar.addEventListener('click', aoCancelar);
      el.dlgConfirmar.addEventListener('close', aoFechar, { once: true });
      el.dlgConfirmar.showModal();
    });
  }

  // Liga ou desliga o modo prática em todas as modalidades, mantendo o
  // switch, a modalidade atual e o que está salvo sempre de acordo.
  function definirModoPratica(ligado) {
    dados.modoPratica = ligado;
    if (ligado) {
      dados.ativos[dados.modo] = 'pratica';
    } else {
      Object.keys(MODOS).forEach((m) => {
        dados.ativos[m] = 'diario';
      });
    }
    salvar();
    fecharDialogos();
    renderizarTudo();
  }

  async function novaRodada() {
    const modo = dados.modo;
    const atual = jogoAtual();

    // No diário, o botão leva ao modo prática.
    if (atual.tipo !== 'pratica') {
      definirModoPratica(true);
      avisar('Modo prática ativado.');
      return;
    }

    // Uma prática recém-sorteada e ainda vazia já é uma rodada nova.
    if (statusJogo(atual) === 'jogando' && atual.palpites.length === 0) {
      fecharDialogos();
      avisar('Nova prática.');
      return;
    }

    if (statusJogo(atual) === 'jogando') {
      const ok = await confirmar('Começar uma nova prática? As palavras não resolvidas da rodada atual contam como erros.');
      if (!ok) return;
      // Abandonar conta no placar da prática, para não esconder derrotas.
      contabilizar(atual, false);
    }

    if (resultadoPendente === atual) resultadoPendente = null;
    dados.jogos[`${modo}:pratica`] = criarJogo(modo, 'pratica');
    salvar();

    fecharDialogos();
    renderizarTudo();
    avisar('Nova prática.');
  }

  function voltarAoDiario() {
    definirModoPratica(false);
  }

  function trocarModo(modo) {
    if (!MODOS[modo] || modo === dados.modo) return;
    dados.modo = modo;
    dados.ativos[modo] = dados.modoPratica ? 'pratica' : 'diario';
    salvar();
    renderizarTudo();
  }

  /* ------------------------------------------------------------------------
     Teclado
     ------------------------------------------------------------------------ */

  function construirTeclado() {
    const linhas = ['qwertyuiop', 'asdfghjkl'];
    const ultima = 'zxcvbnm';
    const container = document.createElement('div');
    container.className = 'teclado-linhas';

    const criarLetra = (letra) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'tecla';
      botao.dataset.letra = letra;
      botao.textContent = letra;
      botao.setAttribute('aria-label', letra.toUpperCase());
      return botao;
    };

    linhas.forEach((linha) => {
      const div = document.createElement('div');
      div.className = 'tecla-linha';
      [...linha].forEach((letra) => div.appendChild(criarLetra(letra)));
      container.appendChild(div);
    });

    const ultimaLinha = document.createElement('div');
    ultimaLinha.className = 'tecla-linha';

    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'tecla especial';
    enter.dataset.acao = 'enter';
    enter.textContent = 'enter';
    enter.setAttribute('aria-label', 'Enviar palpite');

    const apagar = document.createElement('button');
    apagar.type = 'button';
    apagar.className = 'tecla especial';
    apagar.dataset.acao = 'apagar';
    apagar.textContent = '⌫';
    apagar.setAttribute('aria-label', 'Apagar letra');

    ultimaLinha.appendChild(enter);
    [...ultima].forEach((letra) => ultimaLinha.appendChild(criarLetra(letra)));
    ultimaLinha.appendChild(apagar);
    container.appendChild(ultimaLinha);

    el.teclado.appendChild(container);
  }

  function atualizarSelecaoTeclado() {
    el.teclado.querySelectorAll('.tecla[data-letra]').forEach((botao) => {
      if (letraSelecionada && botao.dataset.letra === letraSelecionada) {
        botao.classList.add('selecionada');
      } else {
        botao.classList.remove('selecionada');
      }
    });
  }

  function piscarTecla(tecla) {
    const seletor = /^[a-z]$/.test(tecla)
      ? `.tecla[data-letra="${tecla}"]`
      : `.tecla[data-acao="${tecla}"]`;
    const botao = el.teclado.querySelector(seletor);
    if (!botao) return;
    botao.classList.add('ativa');
    window.setTimeout(() => botao.classList.remove('ativa'), 100);
  }

  /* ------------------------------------------------------------------------
     Biblioteca de palavras
     ------------------------------------------------------------------------ */

  function montarBiblioteca() {
    const fragmento = document.createDocumentFragment();

    BIBLIOTECA.forEach(({ com, sem }) => {
      const item = document.createElement('li');
      item.textContent = com;
      item.dataset.busca = sem;
      fragmento.appendChild(item);
    });

    el.listaPalavras.appendChild(fragmento);
    el.contagemBiblioteca.textContent = textoContagemBiblioteca();
    el.btnBiblioteca.textContent = 'Ver as palavras aceitas';
  }

  function formatarNumero(n) {
    return n.toLocaleString('pt-BR');
  }

  function textoContagemBiblioteca() {
    return `${formatarNumero(DICIONARIO.size)} palavras aceitas como palpite. `
      + `A lista mostra as ${formatarNumero(BIBLIOTECA.length)} que têm significado.`;
  }

  function filtrarBiblioteca() {
    const termo = normalizar(el.buscaPalavra.value);
    let visiveis = 0;

    [...el.listaPalavras.children].forEach((item) => {
      const combina = !termo || item.dataset.busca.includes(termo);
      item.hidden = !combina;
      if (combina) visiveis += 1;
    });

    // Palavras que só valem como palpite não aparecem na lista (são muitas
    // e não têm significado), mas a busca por uma palavra completa as confirma.
    const soPalpite = termo.length === TAMANHO && DICIONARIO.has(termo) && !POR_PALAVRA.has(termo);

    if (!termo) {
      el.contagemBiblioteca.textContent = textoContagemBiblioteca();
    } else if (soPalpite) {
      el.contagemBiblioteca.textContent = `“${termo}” é aceita como palpite, mas não tem significado cadastrado.`;
    } else {
      el.contagemBiblioteca.textContent = `${visiveis} de ${formatarNumero(BIBLIOTECA.length)} palavras com significado.`;
    }

    el.bibliotecaVazia.textContent = termo.length === TAMANHO
      ? 'Essa palavra não é aceita.'
      : 'Nenhuma palavra com significado encontrada.';
    el.bibliotecaVazia.hidden = visiveis !== 0 || !termo || soPalpite;
  }

  function abrirBiblioteca() {
    if (!el.listaPalavras.children.length) montarBiblioteca();
    el.buscaPalavra.value = '';
    filtrarBiblioteca();
    if (el.dlgAjuda.open) el.dlgAjuda.close();
    el.dlgBiblioteca.showModal();
    window.setTimeout(() => el.buscaPalavra.focus(), 40);
  }

  /* ------------------------------------------------------------------------
     Tema e diálogos
     ------------------------------------------------------------------------ */

  function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'escuro' ? '#14120f' : '#f6f2e8');
  }

  function temaInicial() {
    if (dados.tema) return dados.tema;
    if (document.documentElement.dataset.tema) return document.documentElement.dataset.tema;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }

  function alternarTema() {
    const atual = document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro';
    const novo = atual === 'escuro' ? 'claro' : 'escuro';
    dados.tema = novo;
    aplicarTema(novo);
    salvar();
  }

  function fecharDialogos() {
    document.querySelectorAll('dialog[open]').forEach((dialogo) => dialogo.close());
  }

  function verificarDia() {
    const agora = hoje();
    if (agora === diaAtual) return;
    diaAtual = agora;

    if (dados.ativos[dados.modo] !== 'pratica') renderizarTudo();
  }

  /* ------------------------------------------------------------------------
     Eventos
     ------------------------------------------------------------------------ */

  function ligarEventos() {
    document.querySelectorAll('.modo').forEach((botao) => {
      botao.addEventListener('click', () => trocarModo(botao.dataset.modo));
    });

    el.btnNovo.addEventListener('click', novaRodada);
    el.btnModoPratica.addEventListener('click', () => {
      const ligado = !dados.modoPratica;
      definirModoPratica(ligado);
      avisar(ligado ? 'Modo prática ativado.' : 'Modo prática desativado.');
    });
    el.btnDiario.addEventListener('click', voltarAoDiario);
    el.btnVerResultado.addEventListener('click', () => abrirResultado(jogoAtual()));
    el.btnAjuda.addEventListener('click', () => el.dlgAjuda.showModal());
    el.btnTema.addEventListener('click', alternarTema);
    el.btnBiblioteca.addEventListener('click', abrirBiblioteca);
    el.btnCompartilhar.addEventListener('click', compartilhar);
    el.btnBaixarImagem.addEventListener('click', baixarImagemResultado);

    el.btnNovoResultado.addEventListener('click', () => {
      const eraPratica = jogoAtual().tipo === 'pratica';
      fecharDialogos();
      // Na prática, fechar o resultado já sorteia a próxima rodada.
      if (eraPratica) renderizarTudo();
      else novaRodada();
    });

    el.btnEstatisticas.addEventListener('click', () => {
      renderizarEstatisticas(jogoAtual().modo);
      el.dlgEstatisticas.showModal();
    });

    el.teclado.addEventListener('click', (evento) => {
      const botao = evento.target.closest('.tecla');
      if (!botao) return;
      if (botao.dataset.acao === 'enter') teclar('enter');
      else if (botao.dataset.acao === 'apagar') teclar('apagar');
      else if (botao.dataset.letra) teclar(botao.dataset.letra);
    });

    el.buscaPalavra.addEventListener('input', filtrarBiblioteca);

    document.querySelectorAll('[data-fechar]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const dialogo = botao.closest('dialog');
        if (dialogo) dialogo.close();
      });
    });

    document.querySelectorAll('dialog').forEach((dialogo) => {
      dialogo.addEventListener('click', (evento) => {
        if (evento.target === dialogo) dialogo.close();
      });

      dialogo.addEventListener('close', () => {
        // Devolve o foco ao jogo depois de fechar um modal, para que o
        // teclado físico continue funcionando sem ativar o botão de origem.
        window.setTimeout(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

          // Ao fechar o resultado de uma prática concluída, a próxima
          // rodada é sorteada e o tabuleiro novo aparece.
          if (dialogo === el.dlgResultado && dados.ativos[dados.modo] === 'pratica') {
            const jogo = dados.jogos[`${dados.modo}:pratica`];
            if (jogo && statusJogo(jogo) !== 'jogando') renderizarTudo();
          }
        }, 0);
      });
    });

    el.tabuleiros.addEventListener('click', (evento) => {
      const celula = evento.target.closest('.celula');
      if (!celula) return;

      const linha = celula.parentElement;
      const tabuleiro = linha.closest('.tabuleiro');
      if (!linha || !tabuleiro) return;

      const indiceLinha = [...linha.parentElement.children].indexOf(linha);
      const indiceColuna = [...linha.children].indexOf(celula);
      const jogo = jogoAtual();
      if (statusJogo(jogo) !== 'jogando') return;
      if (indiceLinha !== jogo.palpites.length) return;

      cursorPos = indiceColuna;
      atualizarCursorVisual();
    });

    // Cliques com mouse/toque não devem deixar o foco preso em um botão:
    // senão o Enter seguinte ativaria o botão em vez de enviar o palpite.
    document.addEventListener('click', (evento) => {
      if (evento.detail <= 0) return;
      if (document.querySelector('dialog[open]')) return;
      const ativo = document.activeElement;
      if (ativo instanceof HTMLElement && ativo.tagName === 'BUTTON') ativo.blur();
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (document.querySelector('dialog[open]')) return;

      const alvo = evento.target;
      if (alvo instanceof HTMLElement && alvo.closest('input, textarea, select, [contenteditable="true"]')) return;

      // Enter em um botão/link com foco deve ativar o próprio controle.
      if (evento.key === 'Enter' && alvo instanceof HTMLElement && alvo.closest('button, a')) return;

      if (evento.key === 'Enter') {
        evento.preventDefault();
        teclar('enter');
      } else if (evento.key === 'Backspace') {
        evento.preventDefault();
        teclar('apagar');
      } else if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') {
        evento.preventDefault();
        teclar(evento.key);
      } else if (evento.key.length === 1) {
        const letra = normalizar(evento.key);
        if (letra.length === 1) {
          evento.preventDefault();
          teclar(letra);
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) verificarDia();
    });

    window.setInterval(verificarDia, 60000);

    // Sem tema escolhido, acompanha o sistema também durante o uso.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (evento) => {
      if (!dados.tema) aplicarTema(evento.matches ? 'escuro' : 'claro');
    });
  }

  /* ------------------------------------------------------------------------
     Início
     ------------------------------------------------------------------------ */

  function iniciar() {
    if (!BIBLIOTECA.length) {
      avisar('Não foi possível carregar a biblioteca de palavras.', 6000);
      return;
    }

    aplicarTema(temaInicial());
    construirTeclado();
    ligarEventos();
    montarBiblioteca();
    renderizarTudo();
    diaAtual = hoje();
  }

  iniciar();
})();
