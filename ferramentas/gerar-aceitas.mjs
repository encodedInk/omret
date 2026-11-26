// Gera aceitas.txt (palpites válidos) a partir do dicionário Hunspell pt_BR.
// Requer o programa `unmunch` (pacote hunspell-tools) e o dicionário pt_BR
// (pacote hunspell-pt-br ou similar).
// Uso: node ferramentas/gerar-aceitas.mjs [caminho/pt_BR.dic] [caminho/pt_BR.aff]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'aceitas.txt');
const dic = process.argv[2] || '/usr/share/hunspell/pt_BR.dic';
const aff = process.argv[3] || '/usr/share/hunspell/pt_BR.aff';
const MARCA_EXTRAS = '# --- extras ---';

const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Só minúsculas: palavras com maiúscula no dicionário são nomes próprios ou siglas.
const valida = /^[a-záàâãéêíóôõúüç]{5}$/;
const palavras = new Set();

const unmunch = spawn('unmunch', [dic, aff], { stdio: ['ignore', 'pipe', 'ignore'] });
unmunch.on('error', (erro) => {
  console.error(`Não foi possível executar unmunch: ${erro.message}`);
  process.exit(1);
});

for await (const linha of createInterface({ input: unmunch.stdout })) {
  const palavra = linha.trim();
  if (valida.test(palavra)) palavras.add(normalizar(palavra));
}

// Preserva as palavras extras escritas à mão depois da marca.
let extras = '';
try {
  // Procura a linha exata da marca (o cabeçalho também a menciona).
  const linhas = (await readFile(destino, 'utf8')).split('\n');
  const posicao = linhas.lastIndexOf(MARCA_EXTRAS);
  if (posicao >= 0) extras = linhas.slice(posicao + 1).join('\n');
} catch {
  /* arquivo ainda não existe */
}

const cabecalho = `# Palavras de cinco letras aceitas como palpite (sem acentos, uma por linha).
# Não são sorteadas: as respostas vêm de biblioteca.json, que tem os significados.
#
# Gerado por ferramentas/gerar-aceitas.mjs a partir do dicionário pt_BR do
# VERO (Verificador Ortográfico Livre), versão 3.2,
# Copyright (C) 2006-2013 Raimundo Santos Moura, distribuído sob a LGPLv3 e a
# MPL. Esta lista derivada segue sob as mesmas licenças.
# Não edite a lista à mão: para aceitar palavras extras, escreva-as depois da
# linha "${MARCA_EXTRAS}" no fim do arquivo; elas são preservadas ao regenerar.
`;

const lista = [...palavras].sort();
await writeFile(destino, `${cabecalho}${lista.join('\n')}\n${MARCA_EXTRAS}\n${extras}`, 'utf8');
console.log(`aceitas.txt gerado com ${lista.length} palavras. Rode "npm run palavras" em seguida.`);
