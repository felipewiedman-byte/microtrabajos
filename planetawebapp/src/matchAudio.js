// Sonido de los partidos en vivo, generado en el navegador (no se descarga ningún archivo): pitido de árbitro, rumor de tribuna y voz del sistema.
let ctx = null
const ac = () => { try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = ctx || new A(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx } catch { return null } }
// ¿el navegador aún no deja sonar? (hasta el primer toque o tecla)
export const locked = () => !ctx || ctx.state !== 'running'
export const soundOn = () => { try { return localStorage.getItem('goalSound') !== '0' } catch { return true } }
// los navegadores solo dejan sonar después de un toque o tecla: se «despierta» el audio en el primero
export const unlock = () => { ac(); try { speechSynthesis.getVoices() } catch { /* sin voz */ } }
// pitido de árbitro: tono agudo con temblor rápido. pattern = [[inicio, duración], …] en segundos. Devuelve cuántos ms dura.
export function whistle(pattern = [[0, 0.7]], vol = 0.2) {
  const c = ac(); if (!c) return 0
  let end = 0
  for (const [t0, d] of pattern) {
    const t = c.currentTime + t0, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain()
    o.type = 'sine'; o.frequency.value = 2950; lfo.frequency.value = 30; lg.gain.value = 150
    lfo.connect(lg); lg.connect(o.frequency)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, Math.max(t + 0.05, t + d - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + d)
    o.connect(g); g.connect(c.destination); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05)
    end = Math.max(end, t0 + d)
  }
  return end * 1000
}
// rumor de tribuna: ruido rosa filtrado que sube y baja (un gol, una roja…)
export function crowd(sec = 3, vol = 0.16) {
  const c = ac(); if (!c) return
  const n = Math.floor(c.sampleRate * sec), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 3 }
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 0.5
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + sec * 0.25); g.gain.linearRampToValueAtTime(vol * 0.8, t + sec * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + sec)
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(t)
}
// voz del navegador en español; resuelve cuando termina (o a los 8 s, por si el navegador no avisa)
export function speak(text, { cancel = false } = {}) {
  return new Promise(res => {
    try {
      if (!('speechSynthesis' in window)) return res()
      if (cancel) speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = 1.05; u.pitch = 1.05
      const v = speechSynthesis.getVoices().find(x => /^es/i.test(x.lang)); if (v) u.voice = v
      const done = () => res(); u.onend = done; u.onerror = done; setTimeout(done, 8000); speechSynthesis.speak(u)
    } catch { res() }
  })
}
// guion de cada jugada: pitidos + frase
export const SCRIPT = {
  start: e => ({ w: [[0, 0.9]], say: `¡Comienza el partido! ${e.h} contra ${e.a}`, title: 'Comienza el partido', tone: 'ok' }),
  ht: e => ({ w: [[0, 0.35], [0.5, 0.35]], say: `Fin del primer tiempo. ${e.h} ${e.gh}, ${e.a} ${e.ga}`, title: 'Entretiempo', tone: 'ok' }),
  resume: () => ({ w: [[0, 0.6]], say: 'Comienza el segundo tiempo', title: 'Segundo tiempo', tone: 'ok' }),
  end: e => ({ w: [[0, 0.4], [0.55, 0.4], [1.1, 0.9]], say: `¡Final del partido! ${e.h} ${e.gh}, ${e.a} ${e.ga}`, title: 'Final del partido', tone: 'ok' }),
  yellow: e => ({ w: [[0, 0.3]], say: `Tarjeta amarilla para ${e.player ? e.player + ' de ' + e.team : e.team}${e.min ? ', minuto ' + e.min : ''}`, title: 'Tarjeta amarilla', tone: 'yellow' }),
  red: e => ({ w: [[0, 0.5]], say: `¡Tarjeta roja! ${e.player ? e.player + ' de ' + e.team : e.team}${e.min ? ', minuto ' + e.min : ''}`, title: 'Tarjeta roja', tone: 'red', crowd: true })
}
// prueba desde el panel: suena cada tipo de aviso una vez
export async function testSounds() {
  unlock()
  const e = { h: 'Local', a: 'Visitante', gh: 1, ga: 0, team: 'Local', player: 'Jugador de prueba', min: 23 }
  for (const k of ['start', 'yellow', 'red', 'ht', 'end']) { const s = SCRIPT[k](e); const ms = whistle(s.w); if (s.crowd) crowd(2.5); await new Promise(r => setTimeout(r, ms + 200)); await speak(s.say, { cancel: true }) }
  crowd(3); await speak('¡Gooooool de Local! Local 1, Visitante 0', { cancel: true })
}
