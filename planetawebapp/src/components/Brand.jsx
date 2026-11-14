import { useSite } from '../site'
// Site logo: white/light logo on dark backgrounds (default); falls back to the dot + name
export default function Brand({ big, onLight, iconOnly }) {
  const s = useSite(), src = onLight ? (s.logoLight || s.logoDark) : (s.logoDark || s.logoLight)
  if (src) return <img className={'brand-logo' + (big ? ' big' : '') + (iconOnly ? ' icon' : '')} src={src} alt={s.name} />
  if (iconOnly) return <span className="logo" />
  return <div className={'brand' + (big ? ' big' : '')}><span className="logo" />{s.name}</div>
}
