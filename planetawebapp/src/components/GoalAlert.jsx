import { useEffect, useState } from 'react'
// Aviso grande cuando cae un gol en un partido publicado (llega en vivo desde el servidor)
const soundOn = () => { try { return localStorage.getItem('goalSound') !== '0' } catch { return true } }
// pitido corto (sintetizado) + voz del navegador; si el navegador bloquea el sonido, solo queda el aviso
function announce(g) {
  try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const c = new A(), o = c.createOscillator(), v = c.createGain(); o.type = 'square'; o.frequency.value = 2600; v.gain.setValueAtTime(0.0001, c.currentTime); v.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5); o.connect(v).connect(c.destination); o.start(); o.stop(c.currentTime + 0.5); o.onended = () => c.close() } } catch {}
  try { if (!('speechSynthesis' in window)) return; speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(`¡Gooooool${g.own ? ' en contra' : ''} de ${g.team}! ${g.h} ${g.gh}, ${g.a} ${g.ga}`); u.lang = 'es-ES'; u.rate = 1.05; u.pitch = 1.1
    const v = speechSynthesis.getVoices().find(x => /^es/i.test(x.lang)); if (v) u.voice = v
    setTimeout(() => speechSynthesis.speak(u), 450) } catch {}
}
export default function GoalAlert({ onOpen }) {
  const [muted, setMuted] = useState(!soundOn())
  const [g, setG] = useState(null)
  useEffect(() => {
    let t
    const f = e => { setG(e.detail); clearTimeout(t); t = setTimeout(() => setG(null), 9000); if (soundOn()) announce(e.detail) }
    addEventListener('planeta:goal', f); return () => { removeEventListener('planeta:goal', f); clearTimeout(t) }
  }, [])
  if (!g) return null
  return <div className="goal-alert" role="alert" onClick={() => { onOpen?.(g.post); setG(null) }}>
    {/^https:\/\//.test(g.logo) && <img src={g.logo} alt="" />}
    <span className="grow"><b>¡GOOOL{g.own ? ' en contra' : ''} de {g.team}!</b>
      <small>{g.player ? g.player + (g.min ? ' ' + g.min + "'" : '') + ' · ' : ''}{g.h} {g.gh} - {g.ga} {g.a}</small></span>
    <button className="goal-mute" onClick={e => { e.stopPropagation(); const m = !muted; setMuted(m); try { localStorage.setItem('goalSound', m ? '0' : '1') } catch {} if (m) try { speechSynthesis.cancel() } catch {} }} aria-label={muted ? 'Activar sonido de goles' : 'Silenciar goles'}>{muted ? 'Sin sonido' : 'Silenciar'}</button>
  </div>
}
