// Invitados: cada usuario tiene un enlace; cuando la persona invitada confirma su correo, ambos reciben créditos.
const crypto = require('crypto');
const { one, run, settings } = require('./db');
const credits = require('./credits');
const market = require('./market');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras ni números que se confunden

function codeFor(userId) {
  const u = one('SELECT ref_code FROM users WHERE id=?', userId);
  if (u && u.ref_code) return u.ref_code;
  for (let i = 0; i < 8; i++) {
    const code = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
    try { run('UPDATE users SET ref_code=? WHERE id=? AND ref_code IS NULL', code, userId); const v = one('SELECT ref_code FROM users WHERE id=?', userId); if (v.ref_code) return v.ref_code; } catch { /* colisión: reintenta */ }
  }
  return null;
}
const resolve = (code) => (typeof code === 'string' && /^[A-Z2-9]{8}$/.test(code) ? one("SELECT id FROM users WHERE ref_code=? AND status='active'", code)?.id || null : null);

// Se llama cuando un usuario confirma su correo. Premia una sola vez, con tope por invitador.
function onVerified(userId) {
  try {
    const u = one('SELECT id, referred_by, referral_paid FROM users WHERE id=?', userId);
    if (!u || !u.referred_by || u.referral_paid || !credits.isOn()) return;
    run('UPDATE users SET referral_paid=1 WHERE id=?', u.id);
    const s = settings(), reward = Math.round(Number(s.ref_reward_credits) || 0), bonus = Math.round(Number(s.ref_bonus_credits) || 0);
    const paid = one('SELECT COUNT(*) c FROM users WHERE referred_by=? AND referral_paid=1', u.referred_by).c;
    if (reward > 0 && paid <= (Number(s.ref_max_rewards) || 50)) { credits.add(u.referred_by, reward, 'Invitaste a una persona', u.id); market.notify(u.referred_by, `Una persona que invitaste confirmó su cuenta: +${reward} créditos para ti.`, '/invitar'); }
    if (bonus > 0) { credits.add(u.id, bonus, 'Bono por llegar con una invitación', u.referred_by); market.notify(u.id, `Bono de bienvenida por invitación: +${bonus} créditos.`, '/creditos'); }
  } catch (e) { console.error('[Haganapp] invitados:', e.message); }
}
const stats = (userId) => ({ invited: one('SELECT COUNT(*) c FROM users WHERE referred_by=?', userId).c, confirmed: one('SELECT COUNT(*) c FROM users WHERE referred_by=? AND referral_paid=1', userId).c });

module.exports = { codeFor, resolve, onVerified, stats };
