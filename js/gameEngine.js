'use strict';

/**
 * gameEngine.js — Motor principal del juego "Misión Extintor"
 * Depende de: fireData.js (EXTINGUISHERS, SCENARIOS, FIRE_CLASSES)
 *             uiManager.js (UI)
 */

class GameEngine {
  /**
   * @param {HTMLCanvasElement} canvas  - Elemento canvas del juego
   * @param {AudioContext}      audioCtx - Contexto de audio Web API
   */
  constructor(canvas, audioCtx) {
    // Referencia al canvas y contexto 2D
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Contexto de audio (puede ser null si el navegador no lo soporta)
    this.audioCtx = audioCtx;

    // Posición del puntero en el canvas
    this.pointerPos = { x: canvas.width / 2, y: canvas.height / 2 };

    // Historial de posiciones X del puntero para detección de barrido
    this._pointerHistory = [];

    // Estado completo del juego
    this.state = {
      phase: 'idle',           // 'identify'|'select'|'prepare'|'combat'|'victory'|'defeat'
      scenarioIndex: 0,
      fireIntensity: 100,       // 0–100: nivel de intensidad del fuego
      extinguisherCharge: 100,  // 0–100: carga restante del extintor
      timeLeft: 30,             // segundos restantes en la fase de combate
      selectedExtinguisher: null,
      pinPulled: false,         // ¿se jaló el pasador (pin)?
      tape: {                   // Indicadores T-A-P-E del extintor
        T: false,  // Jalar el pasador (Twist/Pull pin)
        A: false,  // Apuntar a la base
        P: false,  // Presionar el maneral
        E: false,  // Efectuar barrido
      },
      diagnosisAttempts: 0,    // Intentos erróneos de diagnóstico de incendio
      selectAttempts: 0,       // Intentos erróneos de selección de extintor
      baseHits: 0,             // Fotogramas apuntando a la base del fuego
      topHits: 0,              // Fotogramas apuntando a la parte superior
      sweepDetected: false,    // ¿Se realizó el movimiento de barrido?
      lastPointerX: null,
      sweepDistance: 0,
      shooting: false,         // ¿El jugador está disparando el extintor?
      animFrame: null,         // ID del requestAnimationFrame activo
      timerInterval: null,     // ID del setInterval del temporizador
    };

    // Inicializar eventos de puntero en el canvas
    this._pointerEventsAttached = false;
    this.setupPointerEvents();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDERIZADO DEL CANVAS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dibuja la escena completa en el canvas.
   * @param {object} scenario - Objeto escenario de SCENARIOS
   */
  renderScene(scenario) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cfg = scenario.visualConfig;

    // Limpiar el canvas y pintar el fondo del escenario
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(0, 0, W, H);

    // Dibujar los elementos visuales de la escena (muebles, objetos, etc.)
    this._drawElements(cfg.elements, W, H);

    // Dibujar el fuego en cada punto de incendio
    for (const fp of cfg.firePoints) {
      this._drawFire(fp);
    }

    // Dibujar los hitboxes (contornos de depuración, 20% opacidad)
    for (const fp of cfg.firePoints) {
      this._drawHitboxes(fp);
    }

    // Dibujar la mira/retícula cuando estamos en fase de combate
    if (this.state.phase === 'combat') {
      this._drawReticle();

      // Dibujar el chorro del extintor si se está disparando y el pin fue jalado
      if (this.state.shooting && this.state.tape.P) {
        this._drawStream();
      }
    }
  }

  /**
   * Dibuja los elementos decorativos del escenario (rectángulos, elipses).
   * @param {Array}  elements - Array de objetos de elemento visual
   * @param {number} W        - Ancho del canvas
   * @param {number} H        - Alto del canvas
   */
  _drawElements(elements, W, H) {
    const ctx = this.ctx;

    for (const el of elements) {
      ctx.save();
      ctx.fillStyle = el.color || '#888';

      if (el.type === 'rect') {
        ctx.fillRect(el.x, el.y, el.w, el.h);

        // Etiqueta opcional sobre el elemento
        if (el.label) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(el.label, el.x + el.w / 2, el.y + el.h / 2 + 4);
        }

      } else if (el.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.w / 2,
          el.y + el.h / 2,
          el.w / 2,
          el.h / 2,
          0, 0, Math.PI * 2
        );
        ctx.fill();

        if (el.label) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(el.label, el.x + el.w / 2, el.y + el.h / 2 + 4);
        }
      }

      ctx.restore();
    }
  }

  /**
   * Dibuja el efecto de fuego animado en un punto de origen.
   * @param {{x:number, y:number, r:number}} fp - Punto de fuego (x, y, radio base)
   */
  _drawFire(fp) {
    const ctx = this.ctx;
    const intensity = this.state.fireIntensity / 100; // 0.0 – 1.0
    const t = Date.now() / 1000;                       // tiempo en segundos para animación
    const r = fp.r * intensity;                        // radio escalado por intensidad

    if (r < 2) return; // Fuego extinguido

    ctx.save();

    // ── Gradientes radiales superpuestos (efecto de masa de fuego) ───────────
    const gradients = [
      { innerColor: 'rgba(255,30,0,0.9)',   outerColor: 'rgba(255,100,0,0)',   rx: 0,    ry: 0,    rr: r },
      { innerColor: 'rgba(255,120,0,0.75)', outerColor: 'rgba(255,200,50,0)', rx: -r*0.2, ry: r*0.1, rr: r * 0.75 },
      { innerColor: 'rgba(255,230,50,0.6)', outerColor: 'rgba(255,180,0,0)', rx: r*0.15,  ry: r*0.05, rr: r * 0.5 },
    ];

    for (const g of gradients) {
      const grd = ctx.createRadialGradient(
        fp.x + g.rx, fp.y + g.ry, 0,
        fp.x + g.rx, fp.y + g.ry, g.rr
      );
      grd.addColorStop(0, g.innerColor);
      grd.addColorStop(1, g.outerColor);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(fp.x + g.rx, fp.y + g.ry, g.rr, g.rr * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Lenguas de llama animadas (bezier curves) ────────────────────────────
    const flameCount = 7; // número de lenguas de llama
    for (let i = 0; i < flameCount; i++) {
      const angle = (i / flameCount) * Math.PI * 2;
      const wobble = Math.sin(t * 3 + i * 1.3) * 0.3; // oscilación temporal
      const h = r * (1.2 + 0.5 * Math.sin(t * 4 + i * 0.7)) * intensity;

      const baseX = fp.x + Math.cos(angle) * r * 0.4;
      const baseY = fp.y + Math.sin(angle) * r * 0.3;
      const tipX  = fp.x + Math.cos(angle + wobble) * r * 0.2;
      const tipY  = fp.y - h; // la punta sube

      // Puntos de control para la curva bezier
      const cp1x = baseX + Math.cos(angle + Math.PI / 2) * r * 0.3;
      const cp1y = baseY - h * 0.4;
      const cp2x = tipX  + Math.cos(angle - Math.PI / 3) * r * 0.2;
      const cp2y = tipY  + h * 0.3;

      // Color degradado de la llama
      const flameGrad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
      flameGrad.addColorStop(0,   'rgba(255, 60, 0, 0.9)');
      flameGrad.addColorStop(0.5, 'rgba(255,160, 0, 0.7)');
      flameGrad.addColorStop(1,   'rgba(255,240,50, 0)');

      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tipX, tipY);
      ctx.strokeStyle = flameGrad;
      ctx.lineWidth = r * 0.18 * (1 - i / flameCount * 0.5);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ── Humo (círculos grises semitransparentes que suben desde la llama) ────
    const smokeCount = 5;
    for (let i = 0; i < smokeCount; i++) {
      const phase = ((t * 0.4 + i / smokeCount) % 1); // 0–1 ciclo de vida
      const smokeY  = fp.y - r * 1.5 - phase * r * 2;
      const smokeX  = fp.x + Math.sin(t + i * 1.7) * r * 0.3;
      const smokeR  = r * 0.3 * (1 + phase);
      const alpha   = 0.35 * (1 - phase) * intensity;

      ctx.beginPath();
      ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,80,80,${alpha.toFixed(2)})`;
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Dibuja los hitboxes de depuración del fuego (contornos semitransparentes).
   * hitbox_base = zona inferior (30% del alto de la bounding box)
   * hitbox_top  = zona superior (70% del alto)
   * @param {{x:number, y:number, r:number}} fp
   */
  _drawHitboxes(fp) {
    const ctx = this.ctx;
    const intensity = this.state.fireIntensity / 100;
    const r = fp.r * intensity;

    if (r < 2) return;

    const boxW = r * 2;
    const boxH = r * 2.5;         // alto total del área de fuego
    const boxX = fp.x - r;
    const boxY = fp.y - boxH;     // la caja va hacia arriba desde fp.y

    const baseH = boxH * 0.3;     // 30% inferior = hitbox_base
    const topH  = boxH * 0.7;     // 70% superior = hitbox_top

    ctx.save();
    ctx.globalAlpha = 0.20;

    // hitbox_base — verde
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY + topH, boxW, baseH);

    // hitbox_top — rojo
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, topH);

    ctx.restore();
  }

  /**
   * Devuelve los rectángulos de los hitboxes del primer punto de fuego.
   * @returns {{ base: DOMRect-like, top: DOMRect-like } | null}
   */
  _getHitboxes() {
    const scenario = this._currentScenario();
    if (!scenario) return null;

    const fp = scenario.visualConfig.firePoints[0];
    const intensity = this.state.fireIntensity / 100;
    const r = fp.r * intensity;

    const boxW = r * 2;
    const boxH = r * 2.5;
    const boxX = fp.x - r;
    const boxY = fp.y - boxH;
    const topH  = boxH * 0.7;
    const baseH = boxH * 0.3;

    return {
      base: { x: boxX, y: boxY + topH, w: boxW, h: baseH },
      top:  { x: boxX, y: boxY,        w: boxW, h: topH  },
    };
  }

  /**
   * Verifica si un punto cae dentro de un rectángulo de hitbox.
   * @param {{x,y}} pt
   * @param {{x,y,w,h}} box
   * @returns {boolean}
   */
  _inBox(pt, box) {
    return (
      pt.x >= box.x &&
      pt.x <= box.x + box.w &&
      pt.y >= box.y &&
      pt.y <= box.y + box.h
    );
  }

  /**
   * Dibuja la mira/retícula de apuntado en la posición del puntero.
   */
  _drawReticle() {
    const ctx = this.ctx;
    const { x, y } = this.pointerPos;
    const radius = 24;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;

    // Círculo exterior
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Cruz de la mira
    const arm = radius + 8;
    const gap = 6;
    // horizontal izquierda
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x - gap, y);
    ctx.stroke();
    // horizontal derecha
    ctx.beginPath();
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + arm, y);
    ctx.stroke();
    // vertical arriba
    ctx.beginPath();
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y - gap);
    ctx.stroke();
    // vertical abajo
    ctx.beginPath();
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + arm);
    ctx.stroke();

    // Punto central
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Dibuja el chorro de descarga del extintor (bezier desde la base del canvas al puntero).
   */
  _drawStream() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const { x: tx, y: ty } = this.pointerPos;

    // Punto de origen: centro inferior del canvas
    const sx = W / 2;
    const sy = H;

    // Punto de control de la curva
    const cpx = (sx + tx) / 2 + (Math.random() - 0.5) * 10;
    const cpy = (sy + ty) / 2 - 60;

    ctx.save();

    // Resplandor blanco/cyan con gradiente lineal
    const streamGrad = ctx.createLinearGradient(sx, sy, tx, ty);
    streamGrad.addColorStop(0,   'rgba(200,240,255,0.9)');
    streamGrad.addColorStop(0.5, 'rgba(100,220,255,0.6)');
    streamGrad.addColorStop(1,   'rgba(255,255,255,0.1)');

    // Halo externo (glow)
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
    ctx.strokeStyle = 'rgba(150,230,255,0.3)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Chorro central (más estrecho)
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
    ctx.strokeStyle = streamGrad;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Partículas en el extremo del chorro
    for (let i = 0; i < 4; i++) {
      const px = tx + (Math.random() - 0.5) * 20;
      const py = ty + (Math.random() - 0.5) * 20;
      ctx.beginPath();
      ctx.arc(px, py, 3 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,240,255,0.5)';
      ctx.fill();
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUCLE DE COMBATE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Inicia el bucle de animación de combate con requestAnimationFrame.
   */
  startCombatLoop() {
    // Cancelar cualquier bucle previo
    if (this.state.animFrame) {
      cancelAnimationFrame(this.state.animFrame);
      this.state.animFrame = null;
    }

    const scenario = this._currentScenario();

    const loop = () => {
      // Renderizar la escena en cada fotograma
      this.renderScene(scenario);

      if (this.state.shooting && this.state.pinPulled) {
        // ── Drenar la carga del extintor ─────────────────────────────────────
        this.state.extinguisherCharge = Math.max(
          0,
          this.state.extinguisherCharge - 0.4
        );

        // ── Evaluar posición del puntero en los hitboxes ──────────────────────
        const boxes = this._getHitboxes();
        if (boxes) {
          if (this._inBox(this.pointerPos, boxes.base)) {
            // ✅ Apunta a la BASE: reducir fuego
            let reduction = 0.6;

            // Bonus de barrido: duplicar reducción si se detectó el movimiento
            if (this.state.sweepDetected) {
              reduction *= 2;
            }

            this.state.fireIntensity = Math.max(
              0,
              this.state.fireIntensity - reduction
            );
            this.state.baseHits++;
            this.state.tape.A = true;

            // Ocultar la alerta de apuntado incorrecto
            if (typeof UI !== 'undefined') UI.showAimAlert(false);

          } else if (this._inBox(this.pointerPos, boxes.top)) {
            // ❌ Apunta al TOPE: sin reducción, advertencia al jugador
            this.state.topHits++;
            if (typeof UI !== 'undefined') UI.showAimAlert(true);
          } else {
            // Fuera del área: ocultar advertencia
            if (typeof UI !== 'undefined') UI.showAimAlert(false);
          }
        }

        // ── Audio del extintor ────────────────────────────────────────────────
        this.playExtinguisherSound(true);
      } else {
        // Silenciar el extintor cuando no está disparando
        this.playExtinguisherSound(false);
      }

      // ── Audio del fuego según intensidad ─────────────────────────────────────
      this.playFireCrackle(this.state.fireIntensity);

      // ── Verificar condición de victoria ──────────────────────────────────────
      if (this.state.fireIntensity <= 0) {
        this.endPhase('victory');
        return; // Detener el bucle
      }

      // ── Verificar condición de derrota ────────────────────────────────────────
      if (this.state.extinguisherCharge <= 0 || this.state.timeLeft <= 0) {
        this.endPhase('defeat');
        return; // Detener el bucle
      }

      // Continuar el bucle en el siguiente fotograma
      this.state.animFrame = requestAnimationFrame(loop);
    };

    this.state.animFrame = requestAnimationFrame(loop);

    // ── Temporizador de cuenta regresiva (1 segundo por tick) ─────────────────
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
    }

    this.state.timerInterval = setInterval(() => {
      if (this.state.phase !== 'combat') return;

      this.state.timeLeft = Math.max(0, this.state.timeLeft - 1);

      // La condición de derrota por tiempo se evalúa en el bucle de animación
    }, 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENTOS DEL PUNTERO
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Configura los eventos de puntero en el canvas para controlar el extintor.
   */
  setupPointerEvents() {
    if (this._pointerEventsAttached) return;
    this._pointerEventsAttached = true;
    const canvas = this.canvas;

    // ── pointerdown: empezar a disparar ──────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.state.shooting = true;
      this.state.tape.P = true; // Se presionó el maneral
      this._updatePointerPos(e);
    });

    // ── pointermove: actualizar posición y detectar barrido ───────────────────
    canvas.addEventListener('pointermove', (e) => {
      e.preventDefault();
      const prevX = this.pointerPos.x;
      this._updatePointerPos(e);

      if (this.state.phase === 'combat') {
        this._trackSweep(prevX);

        // Mostrar/ocultar consejo de barrido según posición
        const boxes = this._getHitboxes();
        if (boxes && this._inBox(this.pointerPos, boxes.top)) {
          if (typeof UI !== 'undefined') UI.showAimAlert(true);
        } else {
          if (typeof UI !== 'undefined') UI.showAimAlert(false);
        }

        // Mostrar sugerencia de barrido si aún no se ha detectado
        if (!this.state.sweepDetected && this.state.baseHits > 30) {
          if (typeof UI !== 'undefined') UI.showSweepTip(true);
        }
      }
    });

    // ── pointerup: dejar de disparar ─────────────────────────────────────────
    canvas.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.state.shooting = false;
    });

    // Cancelar disparo si el puntero sale del área capturada
    canvas.addEventListener('pointercancel', () => {
      this.state.shooting = false;
    });
  }

  /**
   * Actualiza la posición del puntero relativa al canvas.
   * @param {PointerEvent} e
   */
  _updatePointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    // Escalar coordenadas al espacio del canvas (puede diferir del tamaño CSS)
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;

    this.pointerPos = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  /**
   * Rastrea el movimiento horizontal del puntero para detectar el barrido.
   * Si el puntero recorre más de 80 px sobre la base en los últimos 60 fotogramas
   * se activa la bonificación de barrido (tape.E = true).
   * @param {number} prevX - Posición X del puntero en el fotograma anterior
   */
  _trackSweep(prevX) {
    const currentX = this.pointerPos.x;
    const delta = Math.abs(currentX - prevX);

    // Acumular distancia de barrido
    this.state.sweepDistance += delta;

    // Mantener historial de las últimas 60 posiciones X
    this._pointerHistory.push(currentX);
    if (this._pointerHistory.length > 60) {
      this._pointerHistory.shift();
    }

    // Verificar si el rango de movimiento supera los 80 px
    if (this._pointerHistory.length >= 10) {
      const minX = Math.min(...this._pointerHistory);
      const maxX = Math.max(...this._pointerHistory);

      const boxes = this._getHitboxes();
      const overBase = boxes && this._inBox(this.pointerPos, boxes.base);

      if ((maxX - minX) > 80 && overBase && !this.state.sweepDetected) {
        this.state.sweepDetected = true;
        this.state.tape.E = true;

        // Ocultar el consejo de barrido ya que se realizó correctamente
        if (typeof UI !== 'undefined') UI.showSweepTip(false);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERACCIÓN CON EL PASADOR (PIN)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ejecuta la acción de jalar el pasador del extintor (Paso 1 de T.A.P.E.).
   * Método público invocable desde la UI o eventos de entrada.
   */
  pullPin() {
    if (this.state.pinPulled) return; // Ya fue jalado

    this.state.pinPulled = true;
    this.state.tape.T = true; // "T" = Jalar el pasador

    // Efecto de sonido del pasador
    this._playPinClick();

    // Transición a la fase de apuntado / combate
    this.startPhase('combat');
    this.startCombatLoop();
  }

  /**
   * Configura la interacción con el elemento del pasador del extintor.
   * @param {HTMLElement} pinElement - Elemento DOM del pasador (SVG o div)
   */
  setupPinInteraction(pinElement) {
    if (!pinElement) return;

    const pullPinHandler = () => {
      this.pullPin();
    };

    pinElement.addEventListener('click',      pullPinHandler);
    pinElement.addEventListener('pointerup',  pullPinHandler);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUDIO
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Inicia o detiene el sonido de descarga del extintor.
   * @param {boolean} active - true para activar, false para silenciar
   */
  playExtinguisherSound(active) {
    if (typeof window.AudioManager !== 'undefined' &&
        typeof window.AudioManager.playExtinguisherSound === 'function') {
      window.AudioManager.playExtinguisherSound(active);
    }
  }

  /**
   * Ajusta el volumen del crepitar del fuego según su intensidad.
   * @param {number} intensity - 0–100
   */
  playFireCrackle(intensity) {
    if (typeof window.AudioManager !== 'undefined' &&
        typeof window.AudioManager.playFireCrackle === 'function') {
      window.AudioManager.playFireCrackle(intensity);
    }
  }

  /**
   * Reproduce el sonido de jalado del pasador.
   * Usa AudioManager si está disponible; si no, genera un pitido sintético.
   */
  _playPinClick() {
    if (typeof window.AudioManager !== 'undefined' &&
        typeof window.AudioManager.playPinClick === 'function') {
      window.AudioManager.playPinClick();
      return;
    }

    // Respaldo: oscilador sintético simple con la Web Audio API
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.15);
    } catch (err) {
      // Ignorar errores de audio en entornos sin soporte
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GESTIÓN DE FASES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Transiciona el juego a una nueva fase.
   * @param {string} name - Nombre de la fase: 'identify'|'select'|'prepare'|'combat'|'victory'|'defeat'
   */
  startPhase(name) {
    this.state.phase = name;

    if (typeof UI !== 'undefined' && typeof UI.showPhase === 'function') {
      UI.showPhase(name, this._currentScenario());
    }
  }

  /**
   * Finaliza la fase de combate con un resultado.
   * Detiene todos los bucles y muestra el resultado al jugador.
   * @param {'victory'|'defeat'} result
   */
  endPhase(result) {
    // Detener el bucle de animación
    if (this.state.animFrame) {
      cancelAnimationFrame(this.state.animFrame);
      this.state.animFrame = null;
    }

    // Detener el temporizador
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }

    // Silenciar todos los sonidos
    this.playExtinguisherSound(false);
    this.playFireCrackle(0);

    // Actualizar la fase
    this.state.phase = result;

    // Mostrar el resultado con las métricas
    if (typeof UI !== 'undefined' && typeof UI.showResult === 'function') {
      UI.showResult(result, this.getMetrics());
    }
  }

  /**
   * Calcula y devuelve las métricas de desempeño del jugador.
   * @returns {{accuracy, baseRatio, chargeLeft, diagnosisAttempts, selectAttempts, sweepBonus}}
   */
  getMetrics() {
    const { baseHits, topHits, extinguisherCharge, diagnosisAttempts, selectAttempts, sweepDetected } = this.state;
    const totalHits = baseHits + topHits;

    const accuracy  = totalHits > 0 ? (baseHits / totalHits) * 100 : 0;
    const baseRatio = accuracy; // Igual que accuracy según especificación

    return {
      accuracy:          Math.round(accuracy * 10) / 10, // un decimal
      baseRatio:         Math.round(baseRatio * 10) / 10,
      chargeLeft:        Math.round(extinguisherCharge * 10) / 10,
      diagnosisAttempts,
      selectAttempts,
      sweepBonus:        sweepDetected,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CICLO DE ESCENARIOS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Carga y arranca un escenario dado su índice en SCENARIOS.
   * Reinicia todo el estado del juego antes de comenzar.
   * @param {number} index - Índice del escenario en el array SCENARIOS
   */
  loadScenario(index) {
    // Cancelar cualquier bucle activo
    if (this.state.animFrame) {
      cancelAnimationFrame(this.state.animFrame);
    }
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
    }

    // Limpiar historial de barrido
    this._pointerHistory = [];

    // Reiniciar todo el estado del juego
    this.state = {
      phase: 'idle',
      scenarioIndex: index,
      fireIntensity: 100,
      extinguisherCharge: 100,
      timeLeft: 30,
      selectedExtinguisher: null,
      pinPulled: false,
      tape: { T: false, A: false, P: false, E: false },
      diagnosisAttempts: 0,
      selectAttempts: 0,
      baseHits: 0,
      topHits: 0,
      sweepDetected: false,
      lastPointerX: null,
      sweepDistance: 0,
      shooting: false,
      animFrame: null,
      timerInterval: null,
    };

    // Cargar el escenario y renderizar el estado inicial
    const scenario = this._currentScenario();
    if (!scenario) {
      console.error('[GameEngine] Escenario no encontrado en índice:', index);
      return;
    }

    this.renderScene(scenario);

    // Iniciar la fase de identificación del incendio
    this.startPhase('identify');
  }

  /**
   * Avanza al siguiente escenario en la lista, en ciclo.
   */
  nextScenario() {
    const total = (typeof SCENARIOS !== 'undefined') ? SCENARIOS.length : 1;
    const nextIndex = (this.state.scenarioIndex + 1) % total;
    this.loadScenario(nextIndex);
  }

  /**
   * Devuelve el objeto del escenario actualmente activo.
   * @returns {object|null}
   */
  _currentScenario() {
    if (typeof SCENARIOS === 'undefined') return null;
    return SCENARIOS[this.state.scenarioIndex] || null;
  }
}

// ── Exponer la clase al ámbito global ───────────────────────────────────────
window.GameEngine = GameEngine;
