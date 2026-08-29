# Farmear Aura — sistema de interfaz

## Intención

La persona está dentro o cerca del torneo, probablemente desde un teléfono, y quiere apoyar en segundos o consultar quién lidera. La interfaz debe sentirse como una transmisión competitiva en vivo: enérgica y memorable, pero legible, directa y confiable.

## Territorio del producto

- Arena y enfrentamiento.
- Carga de Aura.
- Marcador en vivo.
- Ranking y remontada.
- Pulso de votación.
- Credencial de participante.
- Control de torneo.

## Mundo de color

- Arena clara: `#EEF1F8`.
- Vidrio de marcador: `rgba(255,255,255,.60)`.
- Superficie clay: `#F8F9FD`.
- Texto principal: `#171A2C`.
- Púrpura Aura: `#AA16DC`.
- Cian competitivo: `#00A9B8`.
- Rojo de detención: `#9C2631`.

## Firma

El **Riel de Aura** es una línea de energía dividida entre púrpura y cian que representa la proporción de puntos en tiempo real. Aparece como marcador público, como separador del duelo, como indicador de liderazgo y como resumen operativo del panel administrativo.

## Decisiones del sistema

- Profundidad: claymorphism con doble sombra clara/oscura en acciones y tarjetas protagonistas; glassmorphism con desenfoque en paneles de datos y cabeceras.
- Superficies: arena `#EEF1F8`, vidrio translúcido, clay `#F8F9FD` y entradas hundidas en `#EEF1F8`.
- Tipografía: `Sora` para títulos y números competitivos; `Hanken Grotesk` para lectura y controles, siguiendo el sistema extraído de Stitch.
- Espaciado: base de 4 px; ritmos principales 8, 16, 24, 32, 48 y 64 px.
- Radios: 14–16 px en controles, 18–24 px en paneles y 28–32 px en tarjetas protagonistas y modales.
- Movimiento: 150–250 ms, solo para feedback y cambios de estado; se desactiva con `prefers-reduced-motion`.
- Iconos: exclusivamente Lucide con trazo consistente.

## Defaults rechazados

- Tarjetas genéricas de métricas → marcador vivo y ranking contextual.
- Sidebar administrativa estándar → cabecera de control del torneo y área central de resultados.
- Vidrio sin jerarquía o sombras excesivas → vidrio solo en datos y clay solo en acciones/superficies táctiles.
- Foto obligatoria → credencial tipográfica con iniciales cuando no existe imagen.

## Recurso generado

- Vista social: `frontend/public/og-farmear-aura.png`.
- Uso: únicamente metadatos y vista previa al compartir.
- Prompt: póster retrofuturista de torneo en vivo con energía ámbar e índigo, texto exacto “FARMEAR AURA” y “TORNEO EN VIVO”, sin personas ni controles falsos.

## Referencia Stitch adaptada

- Proyecto: `Aura Points Arena` (`2725444226173751660`).
- Pantalla principal: `516c604da6a64b678dc9153b544f32df` — Light Clay Refined.
- Panel administrativo: `9b3e936110fa41bebe955d0e91c44f4e` — Expanded Light Clay Style.
- Comportamiento móvil: `33904641ab4741a68e134e1129dbbdc6` — Mobile Redesign.
- Se adoptan la tensión púrpura/cian, la densidad de datos, las superficies clay y el riel competitivo. Se conserva navegación simplificada, modo claro y flujo responsive propio.
