import { load } from 'cheerio';

const BASE_URL = 'https://www.lascondesonline.cl';
const PORTAL_URL = `${BASE_URL}/partes%20empadronados/portal.asp`;
const CONSULTA_URL = `${BASE_URL}/partes%20empadronados/asp/wcova_pe.asp`;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function obtenerCookieSesion() {
  const response = await fetch(PORTAL_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('No se pudo obtener cookie de sesión');

  return setCookie.split(';')[0];
}

function construirUrlConsulta(placa) {
  const params = new URLSearchParams({
    MAINT: 'GEN',
    CLAVE: placa,
    TIPCON: 'PE',
    SECINI: '0',
    PARAMETROS: `999${placa}P`,
    accionbuscarwcova: 'S',
  });

  return `${CONSULTA_URL}?${params.toString()}`;
}

/**
 * Parsea el HTML y extrae solo multas impagas con los campos esenciales:
 * - numeroParte (identificador único de la multa)
 * - fecha (fecha de la infracción)
 * - valor (monto a pagar)
 */
function parsearHTML(html) {
  const $ = load(html);

  const multas = [];
  const paneles = $('.TabbedPanelsContent');

  if (paneles.length >= 1) {
    const panelImpagas = paneles.eq(0);
    const filas = panelImpagas.find('table[CELLSPACING="1"] tr, table[cellspacing="1"] tr');

    filas.each((i, row) => {
      if (i === 0) return; // header

      const texto = $(row).text();
      if (texto.includes('de Multas:') || texto.includes('Total')) return; // resumen

      const celdas = $(row).find('td');
      // Columnas reales de la tabla:
      // 0=SEL, 1=Tipo, 2=N°Parte, 3=FechaInfracción,
      // 4=MontoInfracción, 5=MontoRebaja, 6=FechaVenceRebaja,
      // 7=ValorAPagar, 8=TraspasadoA, 9=RolCausa, 10=Descripción, 11=FechaCitación
      if (celdas.length >= 8) {
        const numeroParte = celdas.eq(2).text().trim();
        const fecha = celdas.eq(3).text().trim();
        const valor = celdas.eq(7).text().trim();

        if (numeroParte && numeroParte !== '\u00a0' && numeroParte.trim() !== '') {
          multas.push({ numeroParte, fecha, valor });
        }
      }
    });
  }

  return multas;
}

/**
 * Consulta multas impagas para una placa.
 * @param {string} placa - Patente sin guiones ni espacios (ej: "BBBB11")
 * @returns {Promise<Array<{numeroParte: string, fecha: string, valor: string}>>}
 */
export async function consultarPartes(placa) {
  placa = placa.toUpperCase().replace(/[-\s]/g, '');

  if (!/^[A-Z0-9]{4,6}$/.test(placa)) {
    throw new Error('Placa inválida. Debe ser alfanumérica de 4 a 6 caracteres (ej: BBBB11)');
  }

  const cookie = await obtenerCookieSesion();
  const url = construirUrlConsulta(placa);

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
      'Referer': `${BASE_URL}/partes%20empadronados/asp/inplaca.asp`,
    },
  });

  if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  if (html.includes('versi\u00f3n de su Navegador') || html.includes('version de su Navegador')) {
    throw new Error('El servidor rechazó la petición (User-Agent o cookies).');
  }

  return parsearHTML(html);
}
