/* =========================================================================
   Конфетти: тихий фоновый «дождь» + залп по событию.
   Без зависимостей, один canvas.
   ========================================================================= */
const Confetti = (() => {

  const COLORS = ['#e2684b', '#f2a65a', '#7c9a6d', '#c4543a', '#e4d5c3'];
  const SHAPES = ['rect', 'circle', 'ribbon'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas, ctx, dpr = 1, W = 0, H = 0;
  let particles = [];
  let ambient = false;
  let running = false;
  let lastSpawn = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function make(x, y, opts = {}) {
    const angle = opts.angle ?? (Math.random() * Math.PI * 2);
    const speed = opts.speed ?? (Math.random() * 2 + 1);
    return {
      x, y,
      vx: Math.cos(angle) * speed * (opts.spreadX ?? 1),
      vy: Math.sin(angle) * speed - (opts.lift ?? 0),
      w: Math.random() * 7 + 4,
      h: Math.random() * 5 + 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - .5) * .22,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: SHAPES[(Math.random() * SHAPES.length) | 0],
      drag: opts.drag ?? .988,
      gravity: opts.gravity ?? .12,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * .06 + .02,
      alpha: 1,
      fade: opts.fade ?? 0,
      life: 0
    };
  }

  /* лёгкая частица, падающая сверху — фоновый режим */
  function makeAmbient() {
    const p = make(Math.random() * W, -20, { angle: Math.PI / 2, speed: .5, gravity: .012, drag: .999 });
    p.w = Math.random() * 5 + 3;
    p.h = Math.random() * 4 + 3;
    p.alpha = Math.random() * .3 + .18;
    p.vx = (Math.random() - .5) * .35;
    p.vy = Math.random() * .5 + .35;
    return p;
  }

  function draw(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'ribbon') {
      // лента: сплюснутый по X прямоугольник — имитирует поворот в 3D
      const k = Math.cos(p.wobble);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(k), p.h);
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }

  function tick(now) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);

    if (ambient && now - lastSpawn > 420 && particles.length < 60) {
      particles.push(makeAmbient());
      lastSpawn = now;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.wobble += p.wobbleSpeed;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx + Math.sin(p.wobble) * .55;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.fade) p.alpha -= p.fade;

      draw(p);

      if (p.y > H + 40 || p.alpha <= .01 || p.x < -60 || p.x > W + 60) {
        particles.splice(i, 1);
      }
    }

    requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  return {
    init(el) {
      if (reduced) return;
      canvas = typeof el === 'string' ? document.querySelector(el) : el;
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      resize();
      addEventListener('resize', resize, { passive: true });
      start();
    },

    /* тихий фоновый снегопад конфетти */
    ambient(on = true) {
      if (reduced) return;
      ambient = on;
    },

    /* залп из точки: 0..1 по ширине/высоте экрана */
    burst(rx = .5, ry = .4, count = 70) {
      if (reduced || !ctx) return;
      const x = W * rx, y = H * ry;
      for (let i = 0; i < count; i++) {
        particles.push(make(x, y, {
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 9 + 3,
          lift: 3,
          gravity: .19,
          drag: .972,
          fade: .006
        }));
      }
      start();
    },

    /* финальный салют: несколько залпов по сторонам */
    celebrate() {
      if (reduced || !ctx) return;
      const shots = [[.5, .35, 90], [.15, .5, 55], [.85, .5, 55], [.35, .25, 45], [.7, .3, 45]];
      shots.forEach(([x, y, n], i) => setTimeout(() => this.burst(x, y, n), i * 260));
    }
  };
})();
