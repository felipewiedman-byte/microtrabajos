// Avisos por correo antes de que venza la prueba o el plan de un negocio (3 días, 1 día y el día que vence).
// Cada aviso se envía una sola vez por fecha de vencimiento.
const { all, run, now, settings } = require('./db');
const Plans = require('./plans');
const mail = require('./mail');

const DAY = 86400000;
function stageOf(end, t) {
  const left = end - t;
  if (left <= 0) return left > -7 * DAY ? 'exp' : null; // vencido hace menos de 7 días
  if (left <= DAY) return 'd1';
  if (left <= 3 * DAY) return 'd3';
  return null;
}
async function run_() {
  const t = now(), site = settings().site_name, base = (process.env.BASE_URL || '').replace(/\/$/, '');
  const rows = all(`SELECT u.id, u.name, u.email, u.plan, u.plan_until, u.trial_until, u.notice_sent, s.name shop FROM users u JOIN shops s ON s.user_id=u.id
    WHERE u.role='owner' AND u.status='active' AND (u.plan_until BETWEEN ? AND ? OR u.trial_until BETWEEN ? AND ?)`, t - 7 * DAY, t + 3 * DAY, t - 7 * DAY, t + 3 * DAY);
  let sent = 0;
  for (const u of rows) {
    const paid = ['basic', 'pro'].includes(u.plan) && u.plan_until;
    if (paid && u.plan_until > t + 3 * DAY) continue; // tiene plan vigente de sobra
    const end = paid ? u.plan_until : u.trial_until;
    if (!end) continue;
    const stage = stageOf(end, t), mark = `${end}:${stage}`;
    if (!stage || String(u.notice_sent).split(',').includes(mark)) continue;
    const what = paid ? `tu plan ${(Plans.get(u.plan) || {}).name || u.plan}` : 'tu prueba gratis';
    const when = stage === 'exp' ? 'venció' : stage === 'd1' ? 'vence mañana' : 'vence en 3 días';
    const ok = await mail.send({
      to: u.email,
      subject: stage === 'exp' ? `Tu catálogo ${u.shop} está en pausa` : `${what[0].toUpperCase() + what.slice(1)} ${when}`,
      title: stage === 'exp' ? 'Tu catálogo está en pausa' : `${what[0].toUpperCase() + what.slice(1)} ${when}`,
      lines: [`Hola ${u.name.split(' ')[0]},`,
        stage === 'exp' ? `${what[0].toUpperCase() + what.slice(1)} de ${site} venció y tu catálogo "${u.shop}" ya no recibe pedidos. No se borró nada: tus productos y pedidos siguen guardados.` : `${what[0].toUpperCase() + what.slice(1)} de ${site} ${when}. Para que tu catálogo "${u.shop}" siga recibiendo pedidos sin interrupción, elige o renueva tu plan.`,
        'Puedes pagar con tarjeta, PSE o PayPal y el plan se activa al instante.'],
      button: base ? { text: stage === 'exp' ? 'Reactivar mi catálogo' : 'Renovar mi plan', url: base + '/panel/plan' } : undefined,
    }).catch(() => false);
    if (ok) { run('UPDATE users SET notice_sent=? WHERE id=?', [mark, ...String(u.notice_sent).split(',').filter(Boolean)].slice(0, 6).join(','), u.id); sent++; }
  }
  return sent;
}
const schedule = () => { setTimeout(() => run_().catch((e) => console.error('[Vitrina] Avisos:', e.message)), 60000).unref(); setInterval(() => run_().catch((e) => console.error('[Vitrina] Avisos:', e.message)), 3600000).unref(); };
module.exports = { run: run_, schedule, stageOf };
