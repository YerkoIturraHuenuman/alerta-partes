# alerta-partes

Sistema automatizado que monitorea multas de tránsito de un vehículo en el portal municipal de Las Condes (Chile) y envía alertas por email cuando detecta nuevas multas. Funciona tanto en modo local como en GitHub Actions con almacenamiento de estado persistente entre ejecuciones.

> **Este proyecto es un ejemplo práctico de cómo usar GitHub Actions como un servicio de tareas programadas (tipo Lambda/cron) con una capa gratuita generosa.** No necesitas servidor ni pagar hosting.

---

## ¿Qué hace?

1. Consulta el portal [Las Condes Online](https://www.lascondes.cl) con la patente de un vehículo
2. Compara los resultados con el estado anterior (caché)
3. Si detecta multas **nuevas**, envía un email de alerta
4. Si una multa **fue pagada** (desapareció), también lo notifica
5. Se ejecuta automáticamente cada hora de lunes a viernes

---

## Por qué GitHub Actions es una excelente alternativa gratuita a Lambda/Cloud Functions

GitHub Actions te permite ejecutar código en la nube **de forma gratuita** con las siguientes características:

| Característica | Detalle |
|---|---|
| **Minutos gratis (repositorios públicos)** | Ilimitados |
| **Minutos gratis (repositorios privados)** | 2,000 min/mes |
| **Almacenamiento de caché** | 10 GB por repositorio |
| **Cron scheduling** | Expresiones cron estándar |
| **Secrets** | Variables de entorno cifradas |
| **Trigger manual** | `workflow_dispatch` para ejecutar bajo demanda |

Para un job que corre cada hora de lunes a viernes (como este), se usan aproximadamente **40 minutos/mes** en un repositorio privado — muy por debajo del límite gratuito.

### Comparación con alternativas

```
AWS Lambda   → requiere cuenta, configuración de IAM, posibles costos
Vercel Cron  → limitado en plan gratuito
Railway      → requiere servidor corriendo 24/7
GitHub Actions → gratis, sin servidor, sin configuración de infra
```

---

## Arquitectura

```
GitHub Actions (cron: cada hora, lun-vie)
        │
        ▼
  Restaura caché ──── cache-partes.json (IDs de multas conocidas)
        │
        ▼
   index.js ──── scraper.js ──── Portal Las Condes Online
        │
        ▼
  ¿Hay multas nuevas?
     ├── SÍ ──► mailer.js ──── Email al destinatario
     └── NO ──► Log silencioso
        │
        ▼
  Guarda caché actualizado
```

---

## Cómo funciona el caché entre ejecuciones

Este es el mecanismo clave que permite que el job "recuerde" qué multas ya conocía en la ejecución anterior:

```yaml
# .github/workflows/monitor.yml
- name: Restaurar caché
  uses: actions/cache@v4
  with:
    path: cache-partes.json
    key: partes-${{ github.sha }}
    restore-keys: |
      partes-
```

**Flujo del caché:**

```
1ra ejecución:
  cache-partes.json no existe → primera vez, registra multas existentes sin alertar

2da ejecución (1 hora después):
  Restaura cache-partes.json → compara → detecta cambios → alerta si hay nuevas

Nuevo push al repo:
  github.sha cambia → nueva key → caché limpio → comienza desde cero
```

El archivo `cache-partes.json` se genera en tiempo de ejecución y nunca se sube al repositorio (está en `.gitignore`). GitHub Actions lo persiste automáticamente entre runs.

---

## Estructura del proyecto

```
alerta-partes/
├── index.js          # Orquestador principal, lógica de comparación y caché
├── scraper.js        # Web scraping del portal municipal con Cheerio
├── mailer.js         # Envío de emails HTML con Nodemailer
├── package.json      # Dependencias: cheerio, node-cron, nodemailer
└── .github/
    └── workflows/
        └── monitor.yml   # Workflow de GitHub Actions (cron + caché)
```

---

## Variables de entorno requeridas

Configura estos **Secrets** en tu repositorio de GitHub:
`Settings → Secrets and variables → Actions → New repository secret`

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PLACA` | Patente del vehículo a monitorear | `ABCD12` |
| `CORREO` | Email donde llegan las alertas | `tu@gmail.com` |
| `USER_SMTP` | Usuario SMTP (tu cuenta Gmail) | `tu@gmail.com` |
| `PASS_SMTP` | [Contraseña de aplicación de Gmail](https://myaccount.google.com/apppasswords) | `xxxx xxxx xxxx xxxx` |

> **Nota:** Para Gmail, necesitas activar verificación en 2 pasos y generar una "Contraseña de aplicación" específica para este script.

Opcionalmente puedes sobreescribir el servidor SMTP:

| Variable | Por defecto |
|---|---|
| `HOST_SMTP` | `smtp.gmail.com` |
| `PORT_SMTP` | `465` |

---

## Workflow de GitHub Actions explicado

```yaml
# .github/workflows/monitor.yml

name: Monitor Partes

on:
  schedule:
    - cron: "0 * * * 1-5"   # Cada hora, lunes a viernes (UTC)
  workflow_dispatch:          # Permite ejecutar manualmente desde la UI
  push:
    branches: [main]          # También corre en cada push (útil para probar)

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Restaurar caché
        uses: actions/cache@v4
        with:
          path: cache-partes.json
          key: partes-${{ github.sha }}
          restore-keys: |
            partes-

      - run: npm install

      - run: node index.js
        env:                         # Inyecta los secrets como variables de entorno
          IS_CI: "true"
          PLACA: ${{ secrets.PLACA }}
          CORREO: ${{ secrets.CORREO }}
          USER_SMTP: ${{ secrets.USER_SMTP }}
          PASS_SMTP: ${{ secrets.PASS_SMTP }}
```

**Puntos clave del diseño:**

- `IS_CI=true` le indica al script que está en GitHub Actions → activa el modo caché en archivo
- Sin `IS_CI`, el script corre en modo local con node-cron (cada 5 minutos, en memoria)
- Los secrets nunca aparecen en los logs
- El job dura aproximadamente 15-30 segundos por ejecución

---

## Modo local (desarrollo)

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
export PLACA=ABCD12
export CORREO=tu@gmail.com
export USER_SMTP=tu@gmail.com
export PASS_SMTP="xxxx xxxx xxxx xxxx"

# Ejecutar (corre cada 5 minutos con node-cron)
npm start

# Modo desarrollo con recarga automática
npm run dev
```

En modo local el estado se mantiene **en memoria** (se pierde al reiniciar). El archivo `cache-partes.json` solo se usa cuando `IS_CI=true`.

---

## Cómo adaptar este proyecto a tu caso de uso

Este patrón sirve para **cualquier tarea que necesites correr periódicamente en la nube de forma gratuita**:

1. **Cambia `scraper.js`** por la fuente de datos que quieras monitorear (otra web, una API, un RSS feed, etc.)
2. **Cambia `mailer.js`** por el canal de notificación que prefieras (Telegram, Slack, WhatsApp via Twilio, etc.)
3. **Ajusta el cron** en `monitor.yml` según tu frecuencia deseada
4. **El sistema de caché** funciona igual para cualquier tipo de dato que necesites persistir entre ejecuciones

```
Ejemplos de adaptaciones:
  ✓ Monitorear precios de productos en e-commerce
  ✓ Alertar cuando haya turnos disponibles en trámites online
  ✓ Detectar cambios en páginas web (ofertas, noticias, etc.)
  ✓ Verificar disponibilidad de stock
  ✓ Monitorear APIs de terceros y alertar por cambios
```

---

## Dependencias

| Paquete | Versión | Uso |
|---|---|---|
| [cheerio](https://cheerio.js.org/) | ^1.0.0 | Parsing de HTML (estilo jQuery) para extraer datos del portal |
| [node-cron](https://github.com/node-cron/node-cron) | ^3.0.3 | Scheduler local con soporte de timezone |
| [nodemailer](https://nodemailer.com/) | ^8.0.1 | Envío de emails via SMTP |

---

## Licencia

MIT
