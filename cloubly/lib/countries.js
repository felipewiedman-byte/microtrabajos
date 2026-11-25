// Países: código, nombre, prefijo telefónico, moneda, zonas horarias (la primera es la principal) e idioma sugerido (es, en o pt).
// Sirve para registrar un negocio en cualquier país: de aquí salen la moneda, la zona horaria, el idioma y el prefijo del WhatsApp.
const RAW = `AR|Argentina|54|ARS|America/Argentina/Buenos_Aires|es
BO|Bolivia|591|BOB|America/La_Paz|es
BR|Brasil|55|BRL|America/Sao_Paulo,America/Manaus,America/Fortaleza,America/Cuiaba,America/Rio_Branco|pt
CL|Chile|56|CLP|America/Santiago|es
CO|Colombia|57|COP|America/Bogota|es
CR|Costa Rica|506|CRC|America/Costa_Rica|es
DO|Rep. Dominicana|1|DOP|America/Santo_Domingo|es
EC|Ecuador|593|USD|America/Guayaquil|es
SV|El Salvador|503|USD|America/El_Salvador|es
GT|Guatemala|502|GTQ|America/Guatemala|es
HN|Honduras|504|HNL|America/Tegucigalpa|es
MX|México|52|MXN|America/Mexico_City,America/Cancun,America/Tijuana,America/Monterrey,America/Chihuahua|es
NI|Nicaragua|505|NIO|America/Managua|es
PA|Panamá|507|USD|America/Panama|es
PY|Paraguay|595|PYG|America/Asuncion|es
PE|Perú|51|PEN|America/Lima|es
PR|Puerto Rico|1|USD|America/Puerto_Rico|es
UY|Uruguay|598|UYU|America/Montevideo|es
VE|Venezuela|58|VES|America/Caracas|es
US|Estados Unidos|1|USD|America/New_York,America/Chicago,America/Denver,America/Phoenix,America/Los_Angeles,America/Anchorage,Pacific/Honolulu|en
CA|Canadá|1|CAD|America/Toronto,America/Vancouver,America/Edmonton,America/Winnipeg,America/Halifax,America/St_Johns|en
ES|España|34|EUR|Europe/Madrid,Atlantic/Canary|es
PT|Portugal|351|EUR|Europe/Lisbon|pt
GB|Reino Unido|44|GBP|Europe/London|en
IE|Irlanda|353|EUR|Europe/Dublin|en
FR|Francia|33|EUR|Europe/Paris|en
DE|Alemania|49|EUR|Europe/Berlin|en
IT|Italia|39|EUR|Europe/Rome|en
NL|Países Bajos|31|EUR|Europe/Amsterdam|en
BE|Bélgica|32|EUR|Europe/Brussels|en
CH|Suiza|41|CHF|Europe/Zurich|en
AT|Austria|43|EUR|Europe/Vienna|en
SE|Suecia|46|SEK|Europe/Stockholm|en
NO|Noruega|47|NOK|Europe/Oslo|en
DK|Dinamarca|45|DKK|Europe/Copenhagen|en
FI|Finlandia|358|EUR|Europe/Helsinki|en
PL|Polonia|48|PLN|Europe/Warsaw|en
CZ|Chequia|420|CZK|Europe/Prague|en
GR|Grecia|30|EUR|Europe/Athens|en
RO|Rumanía|40|RON|Europe/Bucharest|en
HU|Hungría|36|HUF|Europe/Budapest|en
TR|Turquía|90|TRY|Europe/Istanbul|en
IL|Israel|972|ILS|Asia/Jerusalem|en
AE|Emiratos Árabes Unidos|971|AED|Asia/Dubai|en
SA|Arabia Saudita|966|SAR|Asia/Riyadh|en
EG|Egipto|20|EGP|Africa/Cairo|en
MA|Marruecos|212|MAD|Africa/Casablanca|en
NG|Nigeria|234|NGN|Africa/Lagos|en
GH|Ghana|233|GHS|Africa/Accra|en
KE|Kenia|254|KES|Africa/Nairobi|en
ZA|Sudáfrica|27|ZAR|Africa/Johannesburg|en
IN|India|91|INR|Asia/Kolkata|en
PK|Pakistán|92|PKR|Asia/Karachi|en
BD|Bangladés|880|BDT|Asia/Dhaka|en
ID|Indonesia|62|IDR|Asia/Jakarta,Asia/Makassar,Asia/Jayapura|en
PH|Filipinas|63|PHP|Asia/Manila|en
VN|Vietnam|84|VND|Asia/Ho_Chi_Minh|en
TH|Tailandia|66|THB|Asia/Bangkok|en
MY|Malasia|60|MYR|Asia/Kuala_Lumpur|en
SG|Singapur|65|SGD|Asia/Singapore|en
HK|Hong Kong|852|HKD|Asia/Hong_Kong|en
CN|China|86|CNY|Asia/Shanghai|en
JP|Japón|81|JPY|Asia/Tokyo|en
KR|Corea del Sur|82|KRW|Asia/Seoul|en
AU|Australia|61|AUD|Australia/Sydney,Australia/Melbourne,Australia/Brisbane,Australia/Perth,Australia/Adelaide|en
NZ|Nueva Zelanda|64|NZD|Pacific/Auckland|en`;

const LIST = RAW.split('\n').map((l) => { const [code, name, dial, currency, tz, lang] = l.split('|'); return { code, name, dial, currency, tz: tz.split(','), lang }; })
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
const BY = Object.fromEntries(LIST.map((c) => [c.code, c]));
const get = (code) => BY[String(code || '').toUpperCase()] || null;
// País al que pertenece una zona horaria (la primera coincidencia); sirve para completar negocios que ya existían.
const fromTz = (tz) => (LIST.find((c) => c.tz.includes(tz)) || {}).code || '';
// País sugerido a partir del idioma del navegador (es-CO → CO) o del encabezado que pone Cloudflare.
function guess(req) {
  const cf = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  const al = String(req.headers['accept-language'] || '').match(/[a-z]{2,3}-([A-Za-z]{2})/);
  const c = al ? al[1].toUpperCase() : cf;
  return BY[c] ? c : (BY[cf] ? cf : '');
}
const dialOf = (shop) => (get(shop && shop.country) || {}).dial || '';
module.exports = { LIST, get, fromTz, guess, dialOf };
