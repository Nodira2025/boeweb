# BO growclub - Cultivo & Bienestar Zen

> **Arquitectura operativa v2:** el storefront puede servirse como sitio estático, pero ventas, inventario, caja, clientes, cuenta corriente, pedidos y administración requieren Supabase/PostgreSQL y funciones server-side. Consultá [Arquitectura v2](docs/ARCHITECTURE_V2.md) y [corte seguro](docs/CUTOVER_V2.md) antes de usar datos reales.

Para que otra IA o desarrollador pueda retomar sin repetir la auditoría, usar el [handoff técnico](docs/AI_HANDOFF.md).

Sitio web autogestionable y premium para **BO growclub**, un espacio zen para cultivo premium. Combina catálogo de e-commerce, una Rueda Zen de descuentos interactiva y una sección completa de Guías de Cultivo (Blog).

## 🌟 Características

1. **Catálogo Zen de Productos:**
   * Grilla interactiva y responsiva con filtros por categorías y ordenamiento por relevancia, nombre y precio.
   * Sistema de sellado automático de marca (**BO stamp**) que cubre marcas de agua externas de forma proporcional en cualquier tamaño de imagen.
   * Detalle de producto en modal (bottom-sheet en móviles) con descripción completa y control de stock.

2. **Rueda de la Fortuna Zen:**
   * Rueda interactiva con diseño de mandala que otorga beneficios diarios aleatorios (descuentos, envíos gratis, mensajes de sabiduría budista).
   * Persistencia diaria en `localStorage` para evitar que un mismo cliente gire la rueda más de una vez al día.

3. **Guías de Cultivo (Blog integrado):**
   * Artículos educativos sobre cultivo orgánico, técnicas de luz, mediciones y ciencia.
   * Filtros rápidos por categorías de cultivo.
   * Modo de lectura zen optimizado (Reading Mode) en pantalla completa para facilitar la lectura de artículos largos.

4. **Carrito de Compras y Pedido por WhatsApp:**
   * Carrito interactivo que calcula subtotales, descuentos automáticos ganados en la rueda y bonificaciones.
   * Formulario de entrega y pago integrado.
   * Generación de plantilla automatizada con formato profesional para enviar el pedido pre-armado directamente al WhatsApp de la tienda.

---

## 💻 Ejecución en Local (Evitar CORS)

Debido a que el catálogo de productos (`products.json`) y las guías de cultivo (`articles.json`) se cargan dinámicamente mediante peticiones `fetch()`, los navegadores modernos bloquearán la carga si abres el archivo `index.html` haciendo doble clic desde el explorador de archivos (debido a políticas de CORS para el protocolo `file://`).

Para probar la web localmente, debes levantar un servidor web local simple. Puedes hacerlo de las siguientes formas:

### Opción 1: Con Python (Recomendado)
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
# Si usas Python 3
python -m http.server 8000
```
Luego abre tu navegador en: [http://localhost:8000/](http://localhost:8000/)

### Opción 2: Con Node.js (http-server)
Si tienes Node.js instalado, puedes levantar un servidor con un solo comando:
```bash
npx http-server -p 8000
```
Luego abre tu navegador en: [http://localhost:8000/](http://localhost:8000/)

---

## 🚀 Despliegue sólo del escaparate en GitHub Pages

La parte pública básica puede alojarse en GitHub Pages. La aplicación operativa completa no es 100% estática: necesita Supabase y endpoints server-side, por lo que debe desplegarse en un entorno compatible (por ejemplo Netlify) con las variables privadas configuradas.

1. Crea un repositorio en tu cuenta de GitHub (ej: `bo-growclub`).
2. Sube todos los archivos de esta carpeta a tu repositorio:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/bo-growclub.git
   git branch -M main
   git push -u origin main
   ```
3. En GitHub, ve a la pestaña **Settings** (Configuración) de tu repositorio.
4. En el menú lateral izquierdo, selecciona **Pages**.
5. En la sección **Build and deployment**, bajo *Source*, selecciona **Deploy from a branch**.
6. En la opción *Branch*, selecciona **main** (o la rama que uses) y la carpeta `/ (root)`. Haz clic en **Save** (Guardar).
7. ¡Listo! En un par de minutos, GitHub te dará un enlace público (ej: `https://TU_USUARIO.github.io/bo-growclub/`) donde la web estará online y totalmente funcional.
