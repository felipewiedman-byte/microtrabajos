import { useEffect, useState } from 'react'
// Aviso grande cuando cae un gol en un partido publicado (llega en vivo desde el servidor)
export default function GoalAlert({ onOpen }) {
  const [g, setG] = useState(null)
  useEffect(() => {
    let t
    const f = e => { setG(e.detail); clearTimeout(t); t = setTimeout(() => setG(null), 9000) }
    addEventListener('planeta:goal', f); return () => { removeEventListener('planeta:goal', f); clearTimeout(t) }
  }, [])
  if (!g) return null
  return <button className="goal-alert" onClick={() => { onOpen?.(g.post); setG(null) }}>
    {/^https:\/\//.test(g.logo) && <img src={g.logo} alt="" />}
    <span className="grow"><b>¡GOOOL{g.own ? ' en contra' : ''} de {g.team}!</b>
      <small>{g.player ? g.player + (g.min ? ' ' + g.min + "'" : '') + ' · ' : ''}{g.h} {g.gh} - {g.ga} {g.a}</small></span>
  </button>
}
