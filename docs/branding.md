# Identidad de Cambista

La C ámbar es el símbolo de Cambista. Los dos arcos comparten un centro y dejan abierta la derecha. El extremo superior sobresale levemente para que la C tenga una silueta propia.

## Colores y tipografía

| Color | HEX | Uso |
|---|---|---|
| Ámbar | `#F0B43C` | Símbolo sobre carbón y acentos de marca |
| Carbón | `#171513` | Símbolo y nombre sobre fondo claro, fondo de Android |
| Marfil | `#FAF7EE` | Nombre sobre carbón y fondo del favicon |

El nombre está compuesto en [Manrope](https://fonts.google.com/specimen/Manrope) Semibold (600). En los SVG del logo, el símbolo hace de C inicial y «ambista» está trazado como contornos para conservar el espaciado sin instalar la fuente. Para cambiar el texto, volvé a componerlo en Manrope y convertí el resultado a contornos.

Usá el logo claro en fondos claros y el logo oscuro en fondos carbón. El ámbar sobre carbón tiene una relación de contraste de 9,8:1 y el carbón sobre marfil de 17:1. Para aplicaciones pequeñas conservá el carbón sobre marfil o el ámbar sobre carbón. Dejá al menos un margen alrededor de la marca equivalente a un octavo de la altura visible de la C. En cabeceras, el conjunto con nombre funciona desde 32 px de alto. Para la pestaña del navegador, usá el favicon cuadrado.

## Archivos

| Pieza | Archivo y tamaño | Edición |
|---|---|---|
| Logo para fondo claro | [logo-light.svg](../resources/brand/logo-light.svg), proporción 362 × 96 | Vector editable, fondo transparente |
| Logo para fondo oscuro | [logo-dark.svg](../resources/brand/logo-dark.svg), proporción 362 × 96 | Vector editable, fondo transparente |
| Símbolos sueltos | [Ámbar](../resources/brand/symbol-amber.svg) y [carbón](../resources/brand/symbol-charcoal.svg), proporción 96 × 96 | Vectores editables, fondo transparente |
| Favicon | [SVG](../resources/brand/favicon.svg) y PNG en [16](../resources/brand/favicon-16.png), [32](../resources/brand/favicon-32.png) y [48 px](../resources/brand/favicon-48.png) | El SVG es vectorial. Los PNG tienen las esquinas transparentes |
| Ícono Android completo | [icon-only.png](../resources/icon-only.png), 1024 × 1024 px, y su [versión vectorial](../resources/icon.svg) | El PNG es plano. El SVG permite editar forma y colores |
| Ícono adaptativo de Android | [Primer plano](../resources/icon-foreground.png) y [fondo](../resources/icon-background.png), ambos 1024 × 1024 px | Capas PNG independientes. El primer plano es transparente fuera de la C |
| Pantalla de inicio de Android | [splash.png](../resources/splash.png) y [splash-dark.png](../resources/splash-dark.png), 2732 × 2732 px | PNG planos |

Todos estos archivos son estáticos. El tablero que se usó para aprobar el concepto es una vista de presentación. El primer plano para Android deja la C dentro de la zona segura de 66 × 66 dp de una capa de 108 × 108 dp. [Guía de íconos adaptativos de Android](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)

## Prompts reutilizables

**Cabecera de una página o portada**

> Usá como referencia el SVG del logo de Cambista para el fondo elegido. Conservá los dos arcos de la C, sus extremos rectos y la terminal superior levemente más larga. Usá Manrope Semibold para el nombre y la paleta ámbar `#F0B43C`, carbón `#171513` y marfil `#FAF7EE`. Dejá un margen de un octavo de la altura de la C. Mantené formas planas y una composición fácil de leer.

**Ícono o aplicación pequeña**

> Usá el símbolo oficial de Cambista con su apertura hacia la derecha. Ubicalo centrado ópticamente, en carbón sobre marfil para pestañas o en ámbar sobre carbón para Android. Asegurá que la apertura de la C se distinga a 16 px y que el símbolo funcione en una tinta.
