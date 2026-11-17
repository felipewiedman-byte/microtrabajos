#!/usr/bin/env bash
# Diagnóstico de solo lectura del servidor y de la web. No cambia, borra ni reinicia nada y no imprime llaves ni contraseñas.
# Uso:  bash diagnostico.sh            (resultado en pantalla y en /root/diagnostico.txt)
# Variables opcionales:  APP=/var/www/planetapp  PORT=3010  DOMINIO=worbita.com
APP="${APP:-/var/www/planetapp}"; PORT="${PORT:-3010}"; DOMINIO="${DOMINIO:-worbita.com}"
OUT="${OUT:-/root/diagnostico.txt}"
exec > >(tee "$OUT") 2>&1
sec() { printf '\n==================== %s ====================\n' "$1"; }
ok() { printf '  [OK]    %s\n' "$1"; }
mal() { printf '  [FALLA] %s\n' "$1"; }
av() { printf '  [AVISO] %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

sec "1. SISTEMA"
echo "  Fecha: $(date '+%F %T %Z')"; echo "  Equipo: $(uname -srm)"; echo "  Tiempo encendido: $(uptime -p 2>/dev/null)"
echo "  Carga (1/5/15 min): $(cut -d' ' -f1-3 /proc/loadavg)  · núcleos: $(nproc)"
free -m | awk 'NR==2{printf "  RAM: %s MB usados de %s MB (libres %s MB)\n",$3,$2,$7}'
free -m | awk 'NR==3 && $2>0{printf "  Swap: %s MB usados de %s MB\n",$3,$2}'
df -h / | awk 'NR==2{printf "  Disco /: %s usado de %s (%s)\n",$3,$2,$5}'
USO=$(df / | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${USO:-0}" -ge 90 ] && mal "Disco casi lleno (${USO}%)" || ok "Disco con espacio (${USO}% usado)"
have node && { V=$(node -v); echo "  Node: $V"; MAJ=${V#v}; MAJ=${MAJ%%.*}; [ "$MAJ" -ge 22 ] && ok "Node 22 o superior" || mal "Se necesita Node 22.13 o superior"; } || mal "Node no está instalado"

sec "2. APLICACIÓN (pm2)"
if have pm2; then
  pm2 jlist 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s.slice(s.indexOf("[")));if(!a.length)console.log("  [FALLA] pm2 no tiene aplicaciones");
    for(const p of a){const e=p.pm2_env||{},m=p.monit||{};const up=e.pm_uptime?Math.round((Date.now()-e.pm_uptime)/60000):0;
    console.log("  "+(e.status==="online"?"[OK]   ":"[FALLA]")+" "+p.name+" estado="+e.status+" reinicios="+e.restart_time+" encendida hace "+up+" min  RAM="+Math.round((m.memory||0)/1048576)+" MB  CPU="+(m.cpu||0)+"%");
    if(e.restart_time>10)console.log("         nota: los reinicios se acumulan con cada instalación; solo preocupa si suben solos (compara en dos revisiones)")}}catch(x){console.log("  [AVISO] No pude leer pm2: "+x.message)}})'
else mal "pm2 no está instalado"; fi

sec "3. ARCHIVOS CLAVE"
for f in server.js admin.js wdevents.js public/index.html; do [ -e "$APP/$f" ] && ok "$f" || mal "Falta $f en $APP"; done
DATA="${PLANETA_DATA:-}"; [ -z "$DATA" ] && [ -f "$APP/.env" ] && DATA=$(grep -E '^PLANETA_DATA=' "$APP/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
[ -z "$DATA" ] && DATA="$APP/data"; [ -f "$DATA/planeta.db" ] || { F=$(find / -name planeta.db -not -path '*/node_modules/*' 2>/dev/null | head -1); [ -n "$F" ] && DATA=$(dirname "$F"); }
echo "  Carpeta de datos: $DATA"
[ -f "$DATA/planeta.db" ] && ok "Base de datos: $(du -h "$DATA/planeta.db" | cut -f1)" || mal "No encuentro planeta.db"
if [ -f "$DATA/secret.key" ]; then P=$(stat -c %a "$DATA/secret.key"); [ "$P" = "600" ] || [ "$P" = "400" ] && ok "secret.key existe (permisos $P)" || av "secret.key con permisos $P (lo ideal es 600)"; else mal "Falta secret.key (sin ella no se descifran los respaldos ni las llaves guardadas)"; fi
[ -f "$APP/.env" ] && ok ".env existe (no se muestra su contenido)" || av "No hay .env"
echo "  Espacio por carpeta:"; for d in uploads tiles backups cards; do [ -d "$DATA/$d" ] && printf '    %-10s %s\n' "$d" "$(du -sh "$DATA/$d" 2>/dev/null | cut -f1)"; done
if [ -d "$DATA/backups" ]; then U=$(ls -t "$DATA"/backups/* 2>/dev/null | head -1); if [ -n "$U" ]; then H=$(( ( $(date +%s) - $(stat -c %Y "$U") ) / 3600 )); [ "$H" -le 30 ] && ok "Último respaldo hace ${H} h ($(basename "$U"))" || mal "Último respaldo hace ${H} h: está vencido"; else mal "La carpeta de respaldos está vacía"; fi; else av "No hay carpeta de respaldos"; fi

sec "4. BASE DE DATOS (solo lectura)"
if [ -f "$DATA/planeta.db" ] && have node; then
  DB="$DATA/planeta.db" node --no-warnings -e '
    const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.env.DB,{readOnly:true});
    const Q=String.fromCharCode(39),q=(s)=>{try{return db.prepare(s.replace(/@/g,Q)).get()}catch(e){return null}};
    const ic=q("PRAGMA integrity_check");console.log("  "+(ic&&Object.values(ic)[0]==="ok"?"[OK]   ":"[FALLA] ")+"Integridad: "+(ic?Object.values(ic)[0]:"no se pudo leer"));
    for(const [n,s] of [["Usuarios","SELECT COUNT(*) n FROM users WHERE is_example=0"],["Publicaciones","SELECT COUNT(*) n FROM posts"],["Comentarios","SELECT COUNT(*) n FROM comments"],["Emisoras","SELECT COUNT(*) n FROM stations"],["Cámaras","SELECT COUNT(*) n FROM cams"],["Negocios activos","SELECT COUNT(*) n FROM users WHERE biz=1"],["Reportes sin resolver","SELECT COUNT(*) n FROM reports"],["Eventos del mundo guardados","SELECT COUNT(*) n FROM wd_events"],["Sismos publicados","SELECT COUNT(*) n FROM extra_items WHERE kind=@quake@"],["Películas publicadas","SELECT COUNT(*) n FROM extra_items WHERE kind=@cine@"],["Partidos publicados","SELECT COUNT(*) n FROM sport_fixtures"]]){const r=q(s);console.log("    "+n.padEnd(30)+(r?r.n:"(sin tabla)"))}
    const w=q("SELECT MAX(updated_at) m FROM wd_events");if(w&&w.m)console.log("    Última descarga de eventos       "+Math.round((Date.now()-w.m)/36e5)+" h atrás");
    const dup=q("SELECT COUNT(*) n FROM posts WHERE expires_at IS NOT NULL AND expires_at<"+Date.now());if(dup)console.log("    Publicaciones vencidas aún en base "+dup.n+(dup.n>500?"  [AVISO] la limpieza podría no estar corriendo":""));
    const st=db.prepare("SELECT key,value FROM settings WHERE key IN (\"quakesOn\",\"cineOn\",\"bitOn\",\"wdEventsOn\",\"sportsOn\",\"eventsOn\",\"liveWorld\",\"festivalsOn\",\"holidaysOn\",\"maintenance\")").all();console.log("  Interruptores guardados: "+st.map(r=>r.key+"="+r.value).join("  "))' 2>&1 | sed 's/^/ /'
else av "Se omite (sin base o sin node)"; fi

sec "5. LA APLICACIÓN RESPONDE (dentro del servidor, puerto $PORT)"
chk() { # ruta, esperado
  R=$(curl -s -o /tmp/_d.out -m 15 -w '%{http_code} %{time_total} %{size_download}' "http://127.0.0.1:$PORT$1" 2>/dev/null); C=${R%% *}; REST=${R#* }; T=${REST%% *}; S=${REST##* }
  if [ "$C" = "$2" ]; then ok "$1 → $C en ${T}s (${S} bytes)"; else mal "$1 → $C (esperado $2)"; fi
  awk -v t="$T" 'BEGIN{exit !(t>1.5)}' && av "   lenta: ${T}s"
}
chk / 200; chk /api/settings 200; chk /api/posts 200; chk /api/stations 200; chk /api/cams 200; chk /api/sites 200; chk /api/world-events 200; chk /api/stats 200
chk /api/admin/health 403; chk /api/tiles-status 403
JS=$(curl -s -m 10 "http://127.0.0.1:$PORT/" | grep -o 'assets/index-[^"]*\.js' | head -1); echo "  Cliente publicado: ${JS:-NO ENCONTRADO}"
curl -s -m 10 "http://127.0.0.1:$PORT/" | grep -oE '(src|href)="/assets/[^"]+"' | cut -d'"' -f2 | while read -r A; do C=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:$PORT$A"); [ "$C" = "200" ] || mal "Archivo $A → $C"; done; ok "Archivos principales del cliente revisados"
P=$(curl -s -m 10 "http://127.0.0.1:$PORT/api/posts"); echo "$P" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);console.log("  [OK]   /api/posts devuelve "+d.posts.length+" publicaciones");const sin=d.posts.filter(p=>p.lat==null&&!p.city).length;if(sin)console.log("  [AVISO] "+sin+" sin ciudad ni coordenadas")}catch(e){console.log("  [FALLA] /api/posts no devuelve JSON válido")}})'

sec "6. LA WEB DESDE INTERNET (https://$DOMINIO)"
for u in / /api/settings /api/posts /api/world-events; do
  R=$(curl -s -o /dev/null -m 20 -D /tmp/_h.out -w '%{http_code} %{time_total}' "https://$DOMINIO$u" 2>/dev/null); C=${R%% *}; T=${R##* }
  CF=$(grep -i '^cf-cache-status' /tmp/_h.out | tr -d '\r' | cut -d' ' -f2); EN=$(grep -i '^content-encoding' /tmp/_h.out | tr -d '\r' | cut -d' ' -f2)
  [ "$C" = "200" ] && ok "$u → $C en ${T}s  caché=${CF:--}  compresión=${EN:--}" || mal "$u → $C"
done
for h in strict-transport-security x-content-type-options x-frame-options referrer-policy content-security-policy-report-only content-security-policy; do grep -qi "^$h" /tmp/_h.out 2>/dev/null && ok "Cabecera $h presente" ; done
if have openssl; then E=$(echo | openssl s_client -servername "$DOMINIO" -connect "$DOMINIO:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2); if [ -n "$E" ]; then D=$(( ( $(date -d "$E" +%s) - $(date +%s) ) / 86400 )); [ "$D" -gt 14 ] && ok "Certificado vence en $D días" || mal "Certificado vence en $D días"; fi; fi

sec "7. APACHE Y PUERTOS"
have systemctl && { systemctl is-active --quiet apache2 && ok "Apache activo" || { systemctl is-active --quiet httpd && ok "Apache (httpd) activo" || av "Apache no aparece activo"; }; }
have apachectl && { apachectl configtest 2>&1 | tail -1 | sed 's/^/  configtest: /'; }
have ss && ss -ltnp 2>/dev/null | awk 'NR>1{print "  escuchando: "$4"  "$6}' | sort -u | head -12

sec "8. ERRORES RECIENTES EN LOS REGISTROS"
LOG=$(ls -t /root/.pm2/logs/planetapp*error*.log 2>/dev/null | head -1)
if [ -n "$LOG" ]; then echo "  Archivo: $LOG ($(du -h "$LOG" | cut -f1))"; N=$(tail -n 2000 "$LOG" | grep -iE 'error|sin capturar|unhandled|ECONN|EADDR|SQLITE' | grep -vc ExperimentalWarning); echo "  Líneas con errores en las últimas 2000: $N"
  tail -n 2000 "$LOG" | grep -iE 'error|sin capturar|unhandled|ECONN|EADDR|SQLITE' | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.]+Z? ?//' | cut -c1-150 | sort | uniq -c | sort -rn | head -12 | sed 's/^/    /'
else av "No encontré registros de pm2"; fi
OL=$(ls -t /root/.pm2/logs/*out*.log 2>/dev/null | head -1); [ -n "$OL" ] && { echo "  Avisos del propio servidor (últimas 2000 líneas):"; tail -n 2000 "$OL" | grep -iE 'falló|fallo|no se pudo|error' | cut -c1-150 | sort | uniq -c | sort -rn | head -8 | sed 's/^/    /'; }

sec "9. ENLACES SALIENTES (lo que la web necesita para traer datos)"
for u in "https://query.wikidata.org/sparql?query=ASK%7B%7D&format=json" "https://commons.wikimedia.org/w/api.php?action=query&format=json" "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson" "https://tiles.openfreemap.org/planet" "https://nominatim.openstreetmap.org/status.php"; do
  C=$(curl -s -o /dev/null -m 15 -A 'diagnostico' -w '%{http_code}' "$u" 2>/dev/null); [ "$C" = "200" ] && ok "${u%%\?*} → $C" || av "${u%%\?*} → $C"; done

sec "RESUMEN"
echo "  Revisa las líneas que empiezan con [FALLA] o [AVISO]."; echo "  Este informe quedó guardado en: $OUT"
