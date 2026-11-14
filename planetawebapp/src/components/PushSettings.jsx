import { useEffect, useState } from 'react'
import { pushState, enablePush, setGoals, disablePush, needsInstall } from '../push'

// Dentro de la campana: activar o desactivar los avisos en este dispositivo
export default function PushSettings() {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  useEffect(() => { pushState().then(setSt) }, [])
  if (!st) return null
  if (!st.supported) return needsInstall() ? <p className="push-note">📲 En iPhone: toca Compartir y elige «Añadir a pantalla de inicio» para poder activar los avisos.</p> : null
  const run = async f => { setBusy(true); setErr(''); try { await f(); setSt(await pushState()) } catch (e) { setErr(e.message || 'No se pudo activar.') } finally { setBusy(false) } }
  return <div className="push-box">
    {st.on
      ? <><label className="push-row"><input type="checkbox" checked={!!st.goals} disabled={busy} onChange={e => run(() => setGoals(e.target.checked))} /> Avisarme de los goles</label>
        <button className="push-off" disabled={busy} onClick={() => run(disablePush)}>Desactivar avisos en este dispositivo</button></>
      : <button className="push-btn" disabled={busy} onClick={() => run(() => enablePush(false))}>{busy ? 'Activando…' : '🔔 Activar avisos en este dispositivo'}</button>}
    {st.perm === 'denied' && !st.on && <small className="push-err">Los avisos están bloqueados en este navegador. Actívalos en el candado junto a la dirección.</small>}
    {err && <small className="push-err">{err}</small>}
  </div>
}
