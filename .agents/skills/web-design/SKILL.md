---
name: web-design
description: Guía y estándares de diseño web profesional de alta calidad, mobile-first, sin modales intrusivos, con tipografía refinada y paleta oficial BÔ Grow Club.
---

# Guía & Estándares de Diseño Web Profesional BÔ Grow Club

Esta skill define las reglas obligatorias de diseño UI/UX para garantizar interfaces de nivel producción, modernas, accesibles y estables en dispositivos móviles y de escritorio.

## 1. Reglas Fundamentales de Usabilidad & UI

- **Cero Modales Intrusivos (`position: fixed` sobre el viewport):**
  Evitar ventanas emergentes/pop-ups flotantes para flujos principales de la aplicación (como inicio de sesión, formularios largos o selecciones de perfil). Los elementos desplegables nativos (`<select>`) dentro de contenedores fijos provocan saltos de scroll y desalineación visual en navegadores móviles. Utilizar pantallas inline estables (`display: flex` / `display: block`) en la capa principal.

- **Contraste Extremo y Accesibilidad:**
  - NUNCA texto blanco sobre fondo claro.
  - NUNCA texto oscuro sobre fondo oscuro.
  - Colores de texto principales: `#F6F3E8` (Crema Zen sobre fondos oscuros) o `#152D24` (Verde Bosque Profundo sobre fondos claros).

- **Prohibición del Color Gris Genérico:**
  - Ningún botón ni tarjeta principal debe utilizar gris neutro aburrido (`#888`, `#ccc`, `#eee`).
  - Utilizar únicamente la paleta oficial de marca.

## 2. Paleta Oficial de Marca BÔ Grow Club

- **Verde Bosque Profundo (`#3E5F1F` / `#152D24`):** Fondo de estructura, encabezados y navegación primaria.
- **Verde Hoja Vibrante (`#7EA642` / `#2E7D32`):** Estados de éxito, confirmación de acciones y stock positivo.
- **Dorado / Ocre Orgánico (`#C2A246`):** Acentos, bordes destacados, insignias VIP y botones de llamada a la acción principales (*CTA*).
- **Tierra / Marrón Cálido (`#6B4E2E`):** Fondos secundarios y detalles orgánicos.
- **Crema Zen (`#F6F3E8`):** Fondo principal del sitio y texto legible.

## 3. Tipografía & Jerarquía

- **Títulos y Display:** `Cinzel` / `Outfit` / `Playfair Display` con peso `700` u `800`.
- **Cuerpo y Navegación:** `Montserrat` / `Outfit` en pesos `400`, `500` y `600`.

## 4. Mobile Navigation & Spacing

- **Touch Targets:** Tamaño mínimo interactivo de `44px x 44px` en todos los botones e insumos.
- **Padding Inferior:** Margen inferior de al menos `80px` en contenedores desplazables para evitar solapamiento con la barra de navegación móvil fija.
