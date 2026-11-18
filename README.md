# Alto al Fuego — Misión Extintor: Identifica, Elige y Apunta 🚒🔥

Simulador y videojuego web educativo e interactivo en 2D (HTML5 / CSS3 / JavaScript Vanilla) enfocado en entrenar a estudiantes, trabajadores y brigadistas en el uso correcto de extintores portátiles ante conatos de incendio en el hogar, escuela o trabajo.

---

## 🎯 Objetivos Pedagógicos

El simulador entrena al usuario en los 3 pilares del combate inicial contra conatos de incendio:

1. **Diagnóstico de la Fuente:** Identificar el material en combustión para clasificar el fuego en su categoría normalizada (**Clase A, B, C o K**).
2. **Selección del Agente Extintor:** Elegir el equipo adecuado en el gabinete de emergencia, comprendiendo los riesgos de utilizar agentes incompatibles (ej. agua en fuego eléctrico o fenómeno de boilover en aceite hirviendo).
3. **Manejo y Técnica T.A.P.E.:**
   - **T (Tirar):** Quitar el pasador de seguridad metálico antes de intentar percutir.
   - **A (Apuntar):** Dirigir la boquilla a la **base del fuego** (30% inferior) y no a las llamas (70% superior).
   - **P (Presionar):** Accionar la manija para descargar el chorro presurizado.
   - **E (Esparcir):** Ejecutar barrido horizontal continuo de lado a lado para sofocar el combustible (duplica la efectividad ×2.0).

---

## 🗂️ Arquitectura del Proyecto

```text
/
├── index.html          # Estructura semántica, HUD en vivo, canvas y diálogos modales
├── css/
│   └── styles.css      # Sistema de diseño responsivo, animaciones (flicker, humo, shake)
├── js/
│   ├── fireData.js     # Datos de clases de fuego (A/B/C/K), 4 extintores y 4 escenarios
│   ├── gameEngine.js   # Canvas 2D, bucle rAF, cálculo de hitboxes, barrido y audio
│   └── uiManager.js    # Flujo de pantallas, HUD en tiempo real y Web Audio API sintetizado
└── assets/             # Recursos gráficos vectoriales complementarios
```

---

## 🕹️ Mecánicas de Juego por Fases

- **Fase 1 (Diagnóstico):** Análisis de la escena animada y selección entre 4 clases (A, B, C, K). Los errores ofrecen retroalimentación pedagógica contextual inmediata.
- **Fase 2 (Selección del Extintor):** Elección entre Agua Presurizada, PQS, CO₂ y Tipo K. Si se selecciona un agente peligroso, se dispara una alarma y un modal explicativo con el fundamento físico-químico.
- **Fase 3 (Preparación T.A.P.E. - Paso 1):** Interacción en primer plano con la válvula. Si el usuario intenta presionar la manija sin retirar la argolla del seguro, el sistema bloquea la acción con advertencia.
- **Fase 4 (Combate Activo):**
  - **Hitbox Base (30% inferior):** Reduce la intensidad del fuego.
  - **Hitbox Llamas (70% superior):** Desperdicia carga del extintor y activa la alerta visual flotante: *⚠️ ¡Apunta a la BASE del fuego!*
  - **Detector de Barrido:** Mover el cursor o dedo en abanico horizontal sobre la base activa la insignia **[E]** y duplica la velocidad de extinción.

---

## 🔊 Audio Sintetizado (Web Audio API)

No requiere archivos de audio externos (MP3/WAV):
- **Ruido blanco con filtro paso banda:** Sonido de descarga presurizada al disparar.
- **Ruido filtrado paso bajo:** Crepitar del fuego proporcional a la intensidad de las llamas.
- **Onda cuadrada modulada:** Clic metálico al extraer el seguro.
- **Dos tonos de advertencia (880Hz / 440Hz):** Alarma ante extintores incompatibles o maniobras incorrectas.
- **Arpegio ascendente:** Jingle de victoria al extinguir con éxito el conato.

---

## 🚀 Cómo Ejecutar

Al ser una aplicación web pura y ligera (< 30 MB, sin dependencias ni build tools):
1. Abre directamente el archivo `index.html` en cualquier navegador moderno (Chrome, Edge, Firefox, Safari).
2. O levanta un servidor estático local:
   ```bash
   npx serve .
   # o con Python:
   python -m http.server 8000
   ```
3. Compatible al 100% con ratón en computadoras y pantallas táctiles en dispositivos móviles mediante `PointerEvents`.
