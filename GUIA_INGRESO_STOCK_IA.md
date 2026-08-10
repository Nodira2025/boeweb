# Ingreso de productos, IA y mapa del local

## Qué quedó conectado

El flujo operativo es: **foto → sugerencias de IA → confirmación humana → ubicación → revisión → stock activo**.

- Cada producto recibe un código interno estable `BO-...` y un QR imprimible.
- El QR identifica al producto consumible, no a cada unidad.
- El código de barras es opcional: puede escanearse con el lector del local o escribirse.
- La ubicación se guarda como piso, estante y nivel. Al aprobar el borrador, aparece en el mapa con su stock real.
- Cada estante admite una foto propia para que cualquier vendedor pueda reconocerlo.
- La IA propone nombre, marca, presentación, categoría, descripción y página oficial. El vendedor siempre debe confirmar.
- El precio de Mercado Libre es una referencia estadística en pesos argentinos, no un precio de venta obligatorio.

## Activar las tablas en Supabase

1. Abrir el editor SQL del proyecto de Supabase.
2. Ejecutar completo `scripts/setup_product_drafts_schema.sql`.
3. Recargar `vendedor.html` y abrir **Estantes**. El mensaje debe cambiar de “Modo local” a “Inventario sincronizado”.

La migración conserva los borradores que ya existían.

## Activar el análisis con IA

Las claves son privadas y nunca deben escribirse en `vendedor.js` ni subirse a Git.

### En local

1. Agregar al archivo `.env`:

   ```env
   OPENROUTER_API_KEY=tu_clave_privada_sk_or
   OPENROUTER_PRODUCT_MODEL=openai/gpt-5.6-luna
   ```

2. Opcionalmente agregar un token de Mercado Libre para mejorar la disponibilidad de la búsqueda:

   ```env
   MERCADOLIBRE_ACCESS_TOKEN=tu_token
   ```

3. Ejecutar `iniciar.bat` y entrar en `http://127.0.0.1:4173/vendedor.html`.

### En Netlify

Configurar las mismas variables en **Site configuration → Environment variables** y volver a desplegar el sitio. La clave de OpenRouter debe guardarse como `OPENROUTER_API_KEY`; nunca dentro del código. También conviene fijar:

```env
PRODUCT_ANALYSIS_ALLOWED_ORIGIN=https://boeweb.netlify.app
```

Si no está configurada `OPENROUTER_API_KEY` ni `OPENAI_API_KEY`, el formulario sigue funcionando manualmente y explica qué falta.

## Uso diario recomendado

1. Abrir **Ingresar producto**.
2. Sacar una foto frontal, nítida y con la presentación visible.
3. Pulsar **Analizar foto con IA** y revisar cada sugerencia.
4. Escanear o escribir el código de barras si el producto tiene uno.
5. Elegir piso, estante y nivel.
6. Imprimir la etiqueta QR si hace falta.
7. Enviar a revisión; al aprobar, el producto queda publicado y localizado.

Para encontrarlo después, en **Estantes** se puede buscar por nombre, código BÔ, código de barras o una ubicación como `B-2 medio`.
