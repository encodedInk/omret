// Gera js/palavras.js a partir de biblioteca.json (respostas, com significado)
// e de aceitas.txt (palavras que só valem como palpite).
// Uso: node ferramentas/gerar-palavras.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origem = path.join(raiz, 'biblioteca.json');
const origemAceitas = path.join(raiz, 'aceitas.txt');

const bruto = JSON.parse(await readFile(origem, 'utf8'));
if (!Array.isArray(bruto)) {
  throw new Error('biblioteca.json precisa conter um array.');
}

// Entradas que continuam aceitas como palpite, mas nunca são sorteadas como
// resposta: flexões verbais, siglas, nomes próprios, variantes e formas antigas.
const NAO_RESPOSTA = /^(Flexão de|Sigla|Cidade|Município|Estado d[oa] |País|Povo|Nome (feminino|masculino|próprio)|Variante|Forma (antiga|afrancesada)|Palavra antiga)/i;

const vistos = new Map();
const palavras = [];
const descartadas = [];

for (const item of bruto) {
  const com = String(item?.com_especiais ?? '').trim();
  const sem = String(item?.sem_especiais ?? '').trim().toLowerCase();
  const significado = String(item?.significado ?? '').trim();

  if (!/^[a-z]{5}$/.test(sem)) {
    throw new Error(`Palavra inválida em biblioteca.json: ${JSON.stringify(item)}`);
  }
  if (vistos.has(sem)) {
    // Uma única entrada por palavra normalizada: a primeira vence.
    descartadas.push(`${com} (mantida: ${vistos.get(sem)})`);
    continue;
  }

  vistos.set(sem, com);
  palavras.push(NAO_RESPOSTA.test(significado) ? [com, sem, significado, 0] : [com, sem, significado]);
}

palavras.sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

// Palpites aceitos: tudo de aceitas.txt que ainda não está na biblioteca.
// Linhas vazias e começadas por # são ignoradas; acentos são removidos.
const aceitas = new Set();
const textoAceitas = await readFile(origemAceitas, 'utf8').catch(() => '');
textoAceitas.split('\n').forEach((linha, numero) => {
  const bruta = linha.trim();
  if (!bruta || bruta.startsWith('#')) return;
  const palavra = bruta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/^[a-z]{5}$/.test(palavra)) {
    throw new Error(`Palavra inválida em aceitas.txt, linha ${numero + 1}: ${JSON.stringify(bruta)}`);
  }
  if (!vistos.has(palavra)) aceitas.add(palavra);
});
const listaAceitas = [...aceitas].sort();

const linhas = palavras.map((par) => `  ${JSON.stringify(par)}`).join(',\n');
const respostas = palavras.filter((p) => p.length === 3).length;
const conteudo = `// Arquivo gerado por ferramentas/gerar-palavras.mjs — não edite à mão.
// Fonte: biblioteca.json (${palavras.length} palavras de cinco letras, ${respostas} sorteáveis).
// Formato: [com acentos, sem acentos, significado, 0 = só palpite, nunca resposta]
window.OMRET_PALAVRAS = [
${linhas}
];

// Fonte: aceitas.txt (${listaAceitas.length} palavras extras, aceitas só como palpite).
window.OMRET_ACEITAS = ${JSON.stringify(listaAceitas.join(' '))};
`;

await mkdir(path.join(raiz, 'js'), { recursive: true });
await writeFile(path.join(raiz, 'js', 'palavras.js'), conteudo, 'utf8');
console.log(`js/palavras.js gerado com ${palavras.length} palavras (${respostas} sorteáveis) e ${listaAceitas.length} palpites extras.`);
if (descartadas.length) {
  console.warn(`Aviso: ${descartadas.length} grafias repetidas foram descartadas: ${descartadas.join(', ')}`);
}
