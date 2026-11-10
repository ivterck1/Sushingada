# Landing Restaurante Base

Starter reutilizable para landings gastronómicas con menú, carrito y pedidos por WhatsApp.

- HTML5, CSS3 y JavaScript Vanilla; no introducir frameworks sin aprobación.
- Sin backend ni base de datos en esta versión.
- Preservar separación config / data / theme / engine.
- No hardcodear identidad del cliente dentro de app.js.
- Todos los nuevos clientes deben poder personalizarse sin duplicar lógica funcional.
- Mantener responsive, pensar mobile-first y mantener accesibilidad básica.
- No romper carrito ni WhatsApp; validar datos antes de preparar pedidos.
- Mantener HTML semántico, botones cómodos y código claro sin duplicación.
- Explicar cambios y verificar el flujo afectado.
- No implementar cambios grandes fuera del alcance aprobado sin aprobación.
- app.js es el motor genérico; config.js contiene configuración del negocio, menu-data.js el catálogo y theme.css la identidad visual.
- No introducir identidad, textos, productos, colores ni imágenes de otros clientes.
- Todo cambio publicable debe respetar ?v= en index.html. Incrementar coordinadamente la versión antes de publicar cambios importantes de CSS, JavaScript o assets reemplazados con el mismo nombre (1.0.0 → 1.0.1). Versionar también la referencia real de una imagen reemplazada o renombrarla; versionar su archivo JS/CSS no invalida la caché de la imagen.
- El Excel templates/menu-cliente.xlsx es la fuente inicial recomendada para menús extensos. Validar con tools/import-menu.cjs; no sobrescribir el catálogo sin --write.
- SheetJS CE lee XLSX de clientes editados en Excel, LibreOffice u otras herramientas compatibles; ExcelJS genera la plantilla. El importador no depende de estilos ni tablas internas. Revisar con npm run menu:generate -- archivo.xlsx antes de aplicar con npm run menu:write -- archivo.xlsx.
- Especialidades muestra hasta tres destacados disponibles en orden del catálogo; sin ninguna marca destacado: true usa los primeros tres disponibles. No completar selecciones de uno o dos destacados ni sustituir los agotados por no destacados.
