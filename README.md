# Landing Restaurante Base

Plantilla estática en HTML, CSS y JavaScript Vanilla. El sitio incluido es una demostración ficticia con precios pendientes de aprobación, WhatsApp desactivado y SEO en modo `noindex,follow`.

| Archivo | Responsabilidad |
|---|---|
| `js/config.js` | Identificador del proyecto, identidad, contacto, moneda, entrega, SEO y WhatsApp. |
| `js/menu-data.js` | Catálogo, disponibilidad y destacados. |
| `css/theme.css` | Identidad visual y fondos. |
| `js/app.js` y `css/styles.css` | Interacción, accesibilidad y layout compartidos. |
| `index.html` | Estructura y bloques generados de catálogo, datos comerciales y SEO. |
| `public-files.txt` | Inventario explícito para exportar el sitio. |

## Iniciar un proyecto independiente en Windows

Ejecuta estos pasos **cuando autorices crear el nuevo proyecto**. El ejemplo usa Sushi Ngada y requiere que la carpeta de destino aún no exista. Exporta únicamente los archivos versionados de la rama de consolidación y crea un historial independiente.

```powershell
$base = 'C:/Users/admin/Documents/HANT/Codex/LandingRestauranteBase'
$dest = 'C:/Users/admin/Documents/HANT/Codex/SushiNgada_GIT'
$branch = 'codex/consolidacion-plantilla-gastronomica'
$zip = Join-Path ([IO.Path]::GetTempPath()) ("sushi-ngada-" + [guid]::NewGuid() + ".zip")

if (Test-Path -LiteralPath $dest) { throw "El destino ya existe: $dest" }
git -c safe.directory=$base -C $base archive --format=zip -o $zip $branch
if ($LASTEXITCODE) { throw 'Falló la exportación de la plantilla' }
New-Item -ItemType Directory -Path $dest -ErrorAction Stop | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $dest -ErrorAction Stop
Remove-Item -LiteralPath $zip
Set-Location -LiteralPath $dest
git init -b main
if ($LASTEXITCODE) { throw 'Falló la inicialización de Git' }
git add -- .
git commit -m "Inicia proyecto desde la plantilla gastronómica"
if ($LASTEXITCODE) { throw 'Falló el commit inicial' }
npm ci
```

1. Cambia `projectId` a `sushi-ngada` y `order.storageKey` a `sushi-ngada:cart:v1`. Mantén los precios pendientes, WhatsApp apagado y canonical vacío durante la preparación. Define datos comerciales, textos, moneda y modalidades de entrega en `js/config.js`.
2. Inicializa el catálogo con [el importador Excel](docs/MENU_DESDE_EXCEL.md) o edita los datos directamente. Conserva los IDs una vez asignados. Reemplaza los placeholders y adapta el tema con recursos autorizados de este proyecto.
3. Actualiza `public-files.txt` con los recursos aprobados y ejecuta las comprobaciones de abajo. Usa Studio para cambios operativos posteriores sobre IDs existentes.

## Sincronizar y verificar

Con Node.js 22 y las dependencias de desarrollo del lockfile:

```sh
npm ci
npm run menu:business:sync
npm run menu:html:sync
npm run menu:business:check
npm run menu:html:check
npm run seo:check
npm test
npm run test:site
npm run public:check
```

El smoke usa Playwright con Chrome instalado y sirve los archivos mediante rutas interceptadas. Para usar el Chromium de Playwright instalado dentro del proyecto, define `PLAYWRIGHT_BROWSERS_PATH=0` y `PLAYWRIGHT_CHANNEL=chromium` y ejecuta `npx playwright install chromium`. El smoke intercepta WhatsApp y no envía pedidos. Define `SITE_ARTIFACT` para probar una exportación. Especialidades conserva hasta tres productos disponibles marcados, en orden de catálogo. Cuando no hay marcas, toma los primeros tres disponibles.

## Exportar el sitio

```powershell
$web = Join-Path ([IO.Path]::GetTempPath()) ("landing-web-" + [guid]::NewGuid())
npm run build:site -- "$web"
$env:SITE_ARTIFACT = $web
npm run test:site
Remove-Item Env:SITE_ARTIFACT
```

El destino debe ser nuevo y tener un directorio padre existente fuera del repositorio. El constructor exporta exactamente los archivos de `public-files.txt` y comprueba la sincronización y las referencias locales del sitio. El artefacto funciona en la raíz o un subdirectorio de un hosting estático convencional. El workflow de GitHub solo verifica y construye en el runner. La activación del despliegue requiere autorización aparte.

Antes de lanzar, revisa los datos de los archivos públicos y el inventario. Un precio oculto en el DOM sigue siendo visible en el JS del catálogo. Activa precios y WhatsApp solo con datos confirmados y realiza un pedido de prueba controlado. Cambia a `index,follow` únicamente con una URL canonical HTTPS confirmada.

Actualiza las referencias `?v=` de CSS y JS al cambiar sus contenidos. Si se reemplaza una imagen, renómbrala o versiona su referencia real. Cambiar solo la versión del JS o CSS que la referencia no invalida su caché.

## Operación con Studio

Consulta [Menú desde Excel y Studio Manager](docs/MENU_DESDE_EXCEL.md). Conserva los Excel operativos, las vistas previas, los parches, las credenciales y los respaldos fuera del artefacto y del historial Git. El Excel versionado contiene ejemplos ficticios.
