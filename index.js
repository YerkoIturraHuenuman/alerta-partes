import cron from "node-cron";
import { consultarPartes } from "./scraper.js";
import { enviarAlerta } from "./mailer.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ===================== CONFIGURACIÓN =====================

const PLACA = "VGDC62";
const CRON_SCHEDULE = "0 */5 * * * *";
const IS_CI = !!process.env.CI;
const CACHE_FILE = "./cache-partes.json";

// ===================== HELPERS ===========================

const hora = () =>
  new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
const sep = "━".repeat(52);

function log(icono, msg) {
  console.log(`  ${icono}  ${msg}`);
}

function tablaMultas(multas) {
  const anchoNum = 10;
  const anchoFecha = 12;
  const anchoValor = 12;
  const header = `${"N° Parte".padEnd(anchoNum)}  ${"Fecha".padEnd(anchoFecha)}  ${"Valor".padStart(anchoValor)}`;
  const linea = "─".repeat(anchoNum + anchoFecha + anchoValor + 6);
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

// ===================== ESTADO ============================
// Local: Set en memoria (persiste mientras el proceso viva)
// CI: archivo JSON (persiste entre runs via GitHub Actions Cache)

const multasConocidas = new Set();
let primeraEjecucion = true;

if (IS_CI && existsSync(CACHE_FILE)) {
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    data.forEach((id) => multasConocidas.add(id));
    primeraEjecucion = false;
    log("📂", `Cache cargado: ${multasConocidas.size} parte(s) conocida(s)`);
  } catch {
    log("📂", "Cache vacío, iniciando desde cero");
  }
}

function guardarCache() {
  if (IS_CI) {
    writeFileSync(CACHE_FILE, JSON.stringify([...multasConocidas]));
    log("💾", "Cache actualizado");
  }
}

// ===================== ALERTA ============================

async function alerta(nuevasMultas) {
  console.log("");
  console.log(`  ┌${"─".repeat(50)}┐`);
  console.log(`  │  🚨  ALERTA: ${nuevasMultas.length} NUEVA(S) MULTA(S)${" ".repeat(18 - nuevasMultas.length.toString().length)}│`);
  console.log(`  └${"─".repeat(50)}┘`);
  tablaMultas(nuevasMultas);
  try {
    await enviarAlerta(PLACA, nuevasMultas);
    log("📧", "Correo enviado a yerko.iturra@gmail.com");
  } catch (err) {
    log("❌", `Error enviando correo: ${err.message}`);
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
        log("✅", "Sin multas impagas. Monitoreando...");
      } else {
        await alerta(multas);
      }
      guardarCache();
      return;
    }

    if (pagadas.length > 0) {
      log("💸", `${pagadas.length} multa(s) pagada(s):`);
      pagadas.forEach((id) => console.log(`        ✓ N° ${id}`));
    }

    if (nuevas.length > 0) {
      await alerta(nuevas);
    }

    if (nuevas.length === 0 && pagadas.length === 0) {
      log("✅", `Sin cambios · ${multas.length} multa(s) impaga(s) conocida(s)`);
    }

    guardarCache();
  } catch (error) {
    log("❌", `Error: ${error.message}`);
    if (IS_CI) process.exit(1);
  }
}

// ===================== ARRANQUE ==========================

console.log("");
console.log(`  ${sep}`);
console.log("  🔍  Monitor de Partes — Las Condes Online");
console.log(`  ${sep}`);
console.log(`  Placa:  ${PLACA}`);
console.log(`  Modo:   ${IS_CI ? "GitHub Actions" : `Local (${CRON_SCHEDULE})`}`);
console.log(`  ${sep}`);

await verificar();

if (!IS_CI) {
  cron.schedule(CRON_SCHEDULE, verificar, { timezone: "America/Santiago" });
  console.log(`\n  🟢  Proceso activo — Ctrl+C para detener\n`);
}
