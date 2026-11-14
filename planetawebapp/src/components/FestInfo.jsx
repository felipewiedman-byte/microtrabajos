// "De qué se trata": resumen y foto de la fiesta (Wikipedia)
export default function FestInfo({ post }) {
  const i = post.info; if (!i?.about) return null
  return <div className="fest-info">
    {/^https:\/\//.test(i.img || '') && <img src={i.img} alt="" loading="lazy" />}
    <div className="fest-body"><b>De qué se trata</b><p>{i.about}</p>
      {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="meta">Fuente: Wikipedia · leer más</a>}</div>
  </div>
}
