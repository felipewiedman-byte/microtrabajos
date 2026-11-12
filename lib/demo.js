// Borra los datos de demostración que se crean en una base vacía (3 usuarios, sus tareas y servicios).
// Si alguien real ya contrató, pagó o escribió con esas cuentas, NO borra nada y lo explica.
const { one, all, run, tx } = require('./db');

const DEMO_EMAILS = ['ana@demo.local', 'luis@demo.local', 'cliente@demo.local'];
const ids = () => all(`SELECT id FROM users WHERE email IN (${DEMO_EMAILS.map(() => '?').join(',')}) AND role='user'`, ...DEMO_EMAILS).map((r) => r.id);
const count = () => ids().length;

function purge() {
  const D = ids();
  if (!D.length) return { ok: false, msg: 'No hay datos de demostración.' };
  const inD = `(${D.join(',')})`; // ids numéricos de la propia base, no texto del usuario
  const T = `(SELECT id FROM tasks WHERE client_id IN ${inD})`, G = `(SELECT id FROM gigs WHERE worker_id IN ${inD})`;
  const busy = one(`SELECT (SELECT COUNT(*) FROM orders WHERE client_id IN ${inD} OR worker_id IN ${inD} OR task_id IN ${T} OR gig_id IN ${G})
    + (SELECT COUNT(*) FROM payments WHERE user_id IN ${inD}) + (SELECT COUNT(*) FROM withdrawals WHERE user_id IN ${inD}) c`).c;
  if (busy) return { ok: false, msg: 'No se borró nada: hay pedidos o pagos reales ligados a las cuentas de demostración.' };
  try {
    tx(() => {
      run(`DELETE FROM conv_messages WHERE conv_id IN (SELECT id FROM conversations WHERE a_id IN ${inD} OR b_id IN ${inD})`);
      run(`DELETE FROM conversations WHERE a_id IN ${inD} OR b_id IN ${inD}`);
      run(`DELETE FROM questions WHERE (target_type='task' AND target_id IN ${T}) OR (target_type='gig' AND target_id IN ${G}) OR asker_id IN ${inD}`);
      run(`DELETE FROM applications WHERE task_id IN ${T} OR worker_id IN ${inD}`);
      run(`DELETE FROM reports WHERE reporter_id IN ${inD} OR (target_type='task' AND target_id IN ${T}) OR (target_type='gig' AND target_id IN ${G}) OR (target_type='user' AND target_id IN ${inD})`);
      run(`DELETE FROM tasks WHERE client_id IN ${inD}`);
      run(`DELETE FROM gigs WHERE worker_id IN ${inD}`);
      run(`DELETE FROM notifications WHERE user_id IN ${inD}`);
      run(`DELETE FROM logins WHERE user_id IN ${inD}`);
      run(`DELETE FROM transactions WHERE user_id IN ${inD}`);
      run(`DELETE FROM auth_tokens WHERE user_id IN ${inD}`);
      run(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') IN ${inD}`);
      run(`DELETE FROM users WHERE id IN ${inD}`);
    });
  } catch (e) { return { ok: false, msg: 'No se pudo borrar sin dañar datos reales (' + e.message + '). No se cambió nada.' }; }
  return { ok: true, msg: `Datos de demostración borrados (${D.length} cuentas con sus tareas y servicios).` };
}
module.exports = { count, purge };
