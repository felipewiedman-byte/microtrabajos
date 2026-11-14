import { useState } from 'react'
import { useSite } from '../site'
import { safeUrl } from '../util'
// Logo del sitio: el blanco sobre fondo oscuro (por defecto); si no hay logo o no carga, se muestra el punto + el nombre
export default function Brand({ big, onLight, iconOnly }) {
  const s = useSite(), [bad, setBad] = useState(''), src = safeUrl(onLight ? (s.logoLight || s.logoDark) : (s.logoDark || s.logoLight))
  if (src && bad !== src) return <img className={'brand-logo' + (big ? ' big' : '') + (iconOnly ? ' icon' : '')} src={src} alt={s.name} onError={() => setBad(src)} />
  if (iconOnly) return <span className="logo" />
  return <div className={'brand' + (big ? ' big' : '')}><span className="logo" />{s.name}</div>
}
