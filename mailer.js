import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.HOST_SMTP || "smtp.gmail.com",
  port: Number(process.env.PORT_SMTP) || 587,
  secure: false,
  auth: {
    user: process.env.USER_SMTP,
    pass: process.env.PASS_SMTP
  },
  tls: { rejectUnauthorized: false }
});

function buildHTML(placa, multas) {
  const filas = multas
    .map(
      (m) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #eee;font-family:monospace;font-size:14px">${m.numeroParte}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #eee;font-size:14px">${m.fecha}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #eee;font-size:14px;text-align:right;font-weight:600">${m.valor}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="max-width:500px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="background:#dc3545;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;color:#fff;font-size:18px">🚨 Nueva(s) multa(s) detectada(s)</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px;color:#333;font-size:14px">
        Se detectaron <strong>${multas.length}</strong> multa(s) impaga(s) para la placa <strong>${placa}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:6px;overflow:hidden">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#666;text-transform:uppercase">N° Parte</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#666;text-transform:uppercase">Fecha</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#666;text-transform:uppercase">Valor</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#999">
        Monitor automático — Las Condes Online
      </p>
    </div>
  </div>`;
}

export async function enviarAlerta(placa, multas) {
  const html = buildHTML(placa, multas);

  await transporter.sendMail({
    from: "Monitor",
    to: process.env.CORREO,
    subject: `🚨 ${multas.length} nueva(s) multa(s) — Placa ${placa}`,
    html
  });
}
