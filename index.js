import cron from 'node-cron';
import { consultarPartes } from './scraper.js';
import { enviarAlerta } from './mailer.js';

// ===================== CONFIGURACIÓN =====================

const PLACA = 'VGDC62';
const CRON_SCHEDULE = '0 */5 * * * *'; // cada 5 minutos

// ===================== ESTADO EN MEMORIA =================

const multasConocidas = new Set();
let primeraEjecucion = true;

// ===================== HELPERS ===========================

const hora = () => new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
const sep = '━'.repeat(52);

function log(icono, msg) {
  console.log(`  ${icono}  ${msg}`);
}

function tablaMultas(multas) {
  const anchoNum = 10;
  const anchoFecha = 12;
  const anchoValor = 12;

  const header = `${'N° Parte'.padEnd(anchoNum)}  ${'Fecha'.padEnd(anchoFecha)}  ${'Valor'.padStart(anchoValor)}`;
  const linea = '─'.repeat(anchoNum + anchoFecha + anchoValor + 6);

  console.log(`     ${linea}`);
  console.log(`     ${header}`);
  console.log(`     ${linea}`);
  multas.forEach((m) => {
    const num = m.numeroParte.padEnd(anchoNum);
    const fecha = m.fecha.padEnd(anchoFecha);
    const valor = m.valor.padStart(anchoValor);
    console.log(`     ${num}  ${fecha}  ${valor}`);
  });
  console.log(`     ${linea}`);
}

// ===================== ALERTA ============================

async function alerta(nuevasMultas) {
  console.log('');
  console.log(`  ┌${'─'.repeat(50)}┐`);
  console.log(`  │  🚨  ALERTA: ${nuevasMultas.length} NUEVA(S) MULTA(S)${' '.repeat(18 - nuevasMultas.length.toString().length)}│`);
  console.log(`  └${'─'.repeat(50)}┘`);
  tablaMultas(nuevasMultas);

  try {
    await enviarAlerta(PLACA, nuevasMultas);
    log('📧', 'Correo enviado a yerko.iturra@gmail.com');
  } catch (err) {
    log('❌', `Error enviando correo: ${err.message}`);
  }
}

// ===================== LÓGICA PRINCIPAL ==================

async function verificar() {
  console.log(`\n  ⏰  [${hora()}] Consultando placa ${PLACA}...`);

  try {
    const multas = await consultarPartes(PLACA);
    const idsActuales = new Set(multas.map((m) => m.numeroParte));

    const nuevas = multas.filter((m) => !multasConocidas.has(m.numeroParte));
    const pagadas = [...multasConocidas].filter((id) => !idsActuales.has(id));

    pagadas.forEach((id) => multasConocidas.delete(id));
    nuevas.forEach((m) => multasConocidas.add(m.numeroParte));

    if (primeraEjecucion) {
      primeraEjecucion = false;
      if (multas.length === 0) {
        log('✅', 'Sin multas impagas. Monitoreando...');
      } else {
        await alerta(multas);
      }
      return;
    }

    if (pagadas.length > 0) {
      log('💸', `${pagadas.length} multa(s) pagada(s):`);
      pagadas.forEach((id) => console.log(`        ✓ N° ${id}`));
    }

    if (nuevas.length > 0) {
      await alerta(nuevas);
    }

    if (nuevas.length === 0 && pagadas.length === 0) {
      log('✅', `Sin cambios · ${multas.length} multa(s) impaga(s) conocida(s)`);
    }
  } catch (error) {
    log('❌', `Error: ${error.message}`);
  }
}

// ===================== ARRANQUE ==========================

console.log('');
console.log(`  ${sep}`);
console.log('  🔍  Monitor de Partes — Las Condes Online');
console.log(`  ${sep}`);
console.log(`  Placa:  ${PLACA}`);
console.log(`  Cron:   ${CRON_SCHEDULE}`);
console.log(`  ${sep}`);

await verificar();

cron.schedule(CRON_SCHEDULE, verificar, { timezone: 'America/Santiago' });

console.log(`\n  🟢  Proceso activo — Ctrl+C para detener\n`);
