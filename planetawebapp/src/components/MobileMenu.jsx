import { Avatar } from './ui'
import { openSell } from '../site'

// Menú del celular (hamburguesa): TODO en un solo lugar en vez de una pila de botones sueltos en pantalla.
export default function MobileMenu({ open, setOpen, tab, go, user, unread, isStaff, onPublish, onAuth, onAdmin }) {
  const close = f => () => { setOpen(false); f() }
  // vista 3D, mundo redondo y tipo de mapa son botones del mapa: se pasa al mapa y se pulsan desde aquí
  const mapCtrl = label => close(() => { go('planeta'); setTimeout(() => document.querySelector(label === 'Vista 3D' ? '.map-ctrl .btn-3d' : `.map-ctrl [aria-label="${label}"]`)?.click(), 700) })
  const Item = ({ id, children, onClick, badge }) => <button className={'mm-item' + (id && tab === id ? ' on' : '')} onClick={onClick || close(() => go(id))}>{children}{badge > 0 && <i className="mm-badge">{badge > 9 ? '9+' : badge}</i>}</button>
  return <>
    <button className="hamb" onClick={() => setOpen(o => !o)} aria-label="Menú" aria-expanded={open}><i /><i /><i /></button>
    {open && <>
      <div className="mm-back" onClick={() => setOpen(false)} />
      <nav className="mm" aria-label="Menú principal">
        <button className="mm-x" onClick={() => setOpen(false)} aria-label="Cerrar menú"><i /><i /></button>
        {user
          ? <div className="mm-user"><Avatar name={user.name} hue={user.hue} size={42} src={user.avatar} /><div><b>{user.name}</b><small>@{user.handle}</small></div></div>
          : <button className="mm-login" onClick={close(() => onAuth('login'))}>Entrar o crear cuenta</button>}
        <button className="mm-pub" onClick={close(onPublish)}>Publicar</button>
        <Item id="planeta">Mapa</Item>
        <Item id="ahora">Ahora</Item>
        <Item id="cerca">Explorar cerca</Item>
        <Item id="mensajes" badge={unread}>Mensajes</Item>
        <Item id="comunidad">Comunidad</Item>
        {user && <Item id="huella">Tu huella</Item>}
        <div className="mm-sec">Mapa</div>
        <Item onClick={mapCtrl('Vista 3D')}>Vista 3D</Item>
        <Item onClick={mapCtrl('Ver el globo')}>Mundo redondo</Item>
        <Item onClick={mapCtrl('Cambiar mapa')}>Cambiar tipo de mapa</Item>
        <div className="mm-sec">Más</div>
        <Item onClick={close(() => dispatchEvent(new Event('planeta:radio-open')))}>Radio</Item>
        <Item onClick={close(() => openSell('planes'))}>Planes y precios</Item>
        {isStaff && <Item onClick={close(onAdmin)}>Panel de administración</Item>}
      </nav>
    </>}
  </>
}
