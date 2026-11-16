import { Avatar } from './ui'
import { openSell, useSite } from '../site'
import Brand from './Brand'
import { useRadio } from '../radio'
import { MENU_DEFAULT, mergeList } from '../layout'

// Menú del celular (hamburguesa): TODO en un solo lugar en vez de una pila de botones sueltos en pantalla.
export default function MobileMenu({ onLogout, onAccount, onProfile, open, setOpen, tab, go, user, unread, isStaff, onPublish, onAuth, onAdmin }) {
  const close = f => () => { setOpen(false); f() }
  const site = useSite(), hayRadio = useRadio(s => s.stations.length > 0 || !!s.cur)
  // vista 3D, mundo redondo y tipo de mapa son botones del mapa: se pasa al mapa y se pulsan desde aquí
  const mapCtrl = label => close(() => { go('planeta'); setTimeout(() => document.querySelector(label === 'Vista 3D' ? '.map-ctrl .btn-3d' : `.map-ctrl [aria-label="${label}"]`)?.click(), 700) })
  const Item = ({ id, children, onClick, badge }) => <button className={'mm-item' + (id && tab === id ? ' on' : '')} onClick={onClick || close(() => go(id))}>{children}{badge > 0 && <i className="mm-badge">{badge > 9 ? '9+' : badge}</i>}</button>
  const items = mergeList(MENU_DEFAULT, site.layout?.menu).filter(x => x.show)
  const ACTION = { v3d: mapCtrl('Vista 3D'), globo: mapCtrl('Ver el globo'), capas: mapCtrl('Cambiar mapa'), radio: close(() => dispatchEvent(new Event('planeta:radio-open'))), planes: close(() => openSell('planes')), admin: close(onAdmin), publicar: close(onPublish) }
  const visible = x => x.id === 'huella' ? !!user : x.id === 'admin' ? !!isStaff : x.id === 'radio' ? hayRadio : true
  return <>
    <header className="mh">
      <button className="hamb" onClick={() => setOpen(o => !o)} aria-label="Menú" aria-expanded={open}><i /><i /><i /></button>
      <button className="mh-brand" onClick={() => go('planeta')} aria-label="Inicio"><Brand /><span><b>{site.tagline}</b><small>{site.tagline2}</small></span></button>
    </header>
    {open && <>
      <div className="mm-back" onClick={() => setOpen(false)} />
      <nav className="mm" aria-label="Menú principal">
        <button className="mm-x" onClick={() => setOpen(false)} aria-label="Cerrar menú"><i /><i /></button>
        {user
          ? <><div className="mm-user"><Avatar name={user.name} hue={user.hue} size={42} src={user.avatar} /><div><b>{user.name}</b><small>@{user.handle}</small></div></div>
            <div className="mm-acc"><button onClick={close(onProfile)}>Editar perfil</button><button onClick={close(onAccount)}>Cuenta y contraseña</button><button onClick={close(onLogout)}>Cerrar sesión</button></div></>
          : <button className="mm-login" onClick={close(() => onAuth('login'))}>Entrar o crear cuenta</button>}
        {items.filter(visible).map(x => x.id === 'publicar'
          ? <button key={x.id} className="mm-pub" onClick={ACTION.publicar}>{x.label}</button>
          : <Item key={x.id} id={['v3d', 'globo', 'capas', 'radio', 'planes', 'admin'].includes(x.id) ? null : x.id} badge={x.id === 'mensajes' ? unread : 0} onClick={ACTION[x.id]}>{x.label}</Item>)}
      </nav>
    </>}
  </>
}
