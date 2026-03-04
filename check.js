import { consultarPartes } from './scraper.js';
import { enviarAlerta } from './mailer.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ===================== CONFIGURACIÓN =====================

const PLACA = 'VGDC62';
const CACHE_FILE = './cache-partes.json';

// ===================== LÓGICA ============================

const hora = () => new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

// Cargar partes conocidos del cache (si existe)
let conocidas = new Set();
if (existsSync(CACHE_FILE)) {
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    conocidas = new Set(data);
    console.log(`📂 Cache cargado: ${conocidas.size} parte(s) conocida(s)`);
  } catch {
    console.log('📂 Cache vacío o corrupto, iniciando desde cero');
  }
}

console.log(`⏰ [${hora()}] Consultando placa ${PLACA}...`);

try {
  const multas = await consultarPartes(PLACA);
  const idsActuales = new Set(multas.map((m) => m.numeroParte));

  // Detectar nuevas
  const nuevas = multas.filter((m) => !conocidas.has(m.numeroParte));

  // Detectar pagadas (estaban en cache pero ya no en el sitio)
  const pagadas = [...conocidas].filter((id) => !idsActuales.has(id));

  if (pagadas.length > 0) {
    console.log(`💸 ${pagadas.length} multa(s) pagada(s): ${pagadas.join(', ')}`);
  }

  if (nuevas.length > 0) {
    console.log(`🚨 ${nuevas.length} NUEVA(S) MULTA(S):`);
    nuevas.forEach((m) => console.log(`   • N° ${m.numeroParte} | ${m.fecha} | ${m.valor}`));

    await enviarAlerta(PLACA, nuevas);
    console.log('📧 Correo enviado');
  } else {
    console.log(`✅ Sin multas nuevas. ${multas.length} impaga(s) conocida(s).`);
  }

  // Guardar estado actual en cache (solo los IDs actuales del sitio)
  writeFileSync(CACHE_FILE, JSON.stringify([...idsActuales]));
  console.log('💾 Cache actualizado');

} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}
