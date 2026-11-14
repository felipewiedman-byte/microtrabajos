// Minuto a minuto de un partido (goles, tarjetas, cambios, VAR), del más reciente al más viejo
const KIND = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? ['goal', 'Autogol'] : e.d === 'Penalty' ? ['goal', 'Gol de penal'] : e.d === 'Missed Penalty' ? ['miss', 'Penal fallado'] : ['goal', 'Gol'])
  : e.type === 'Card' ? (/red/i.test(e.d) ? ['red', 'Tarjeta roja'] : ['yellow', 'Tarjeta amarilla'])
  : e.type === 'subst' ? ['sub', 'Cambio'] : e.type === 'Var' ? ['var', 'VAR: ' + (e.d || '')] : ['other', e.d || e.type]
export default function MatchEvents({ m }) {
  const ev = (m?.ev || []).slice().reverse()
  return <div className="mev">
    <div className="mev-h"><b>Minuto a minuto</b><span className="meta">{m.h} {m.gh ?? 0} - {m.ga ?? 0} {m.a}</span></div>
    {ev.length ? ev.map((e, i) => { const [k, label] = KIND(e); return <div key={i} className={'mev-row ' + k}>
      <span className="mev-t">{e.t}{e.x ? '+' + e.x : ''}'</span><span className={'mev-ic ' + k} />
      <span className="grow"><b>{label}</b>{e.p && <> · {k === 'sub' ? `${e.p}${e.a ? ' ↔ ' + e.a : ''}` : e.p}</>}{k === 'goal' && e.a && <span className="meta"> (asistencia: {e.a})</span>}<div className="meta">{e.team}</div></span>
    </div> }) : <p className="meta" style={{ display: 'block', padding: '6px 2px' }}>Aún no hay jugadas registradas. Se actualiza solo durante el partido.</p>}
  </div>
}
