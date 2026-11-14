import { useEffect, useState } from 'react'
import { Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Radio, Flame, CalendarDays } from 'lucide-react'
import { catLabel } from '../data'

// Ciudad viva: el pulso de la ciudad en una fila (clima, actividad de hoy, directos, radios, evento).
const wxIcon = (c, day) => c === 0 ? (day ? Sun : Moon) : c <= 3 ? Cloud : c <= 48 ? CloudFog : c <= 67 || (c >= 80 && c <= 82) ? CloudRain : c <= 77 || (c >= 85 && c <= 86) ? CloudSnow : CloudLightning
const wxText = c => c === 0 ? 'Despejado' : c <= 3 ? 'Nublado' : c <= 48 ? 'Niebla' : c <= 67 || (c >= 80 && c <= 82) ? 'Lluvia' : c <= 77 || (c >= 85 && c <= 86) ? 'Nieve' : 'Tormenta'

export default function CityPulse({ city, onOpen }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    let alive = true; setD(null)
    const load = () => fetch('/api/city/pulse?city=' + encodeURIComponent(city)).then(r => r.ok ? r.json() : null).then(j => { if (alive && j) setD(j) }).catch(() => {})
    load(); const t = setInterval(() => { if (!document.hidden) load() }, 60e3)
    return () => { alive = false; clearInterval(t) }
  }, [city])
  if (!d) return null
  const W = d.weather ? wxIcon(d.weather.code, d.weather.day) : null
  return <div className="pulse-row" role="status" aria-label={'Pulso de ' + city}>
    {W && <span className="pz"><W size={14} /> {d.weather.temp}° <small>{wxText(d.weather.code)}</small></span>}
    <span className="pz"><Flame size={13} /> {d.posts} {d.posts === 1 ? 'publicación' : 'publicaciones'} hoy</span>
    {d.live > 0 && <span className="pz live"><i className="live-dot" /> {d.live} en directo</span>}
    {d.radios > 0 && <span className="pz"><Radio size={13} /> {d.radios} {d.radios === 1 ? 'radio' : 'radios'}</span>}
    {d.top.length > 1 && <span className="pz muted">{d.top.map(t => catLabel(t.cat)).join(' · ')}</span>}
    {d.event && <button className="pz ev" onClick={() => onOpen?.(d.event.id)}><CalendarDays size={13} /> {d.event.title}</button>}
  </div>
}
