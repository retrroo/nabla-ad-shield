/**
 * Nabla Design System — High-Efficiency Constellation Particle Canvas
 * Optimized with batched dot geometry paths and automatic visibility suspension
 * (0% CPU/GPU usage when tab or popup is hidden).
 */

export class ParticleConstellation {
  constructor(canvasElement, options = {}) {
    if (!canvasElement) return;

    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: true });
    this.particles = [];
    this.animationFrameId = null;

    this.options = {
      particleCount: options.particleCount || 40,
      maxDistance: options.maxDistance || 85,
      baseSpeed: options.baseSpeed || 0.3,
      dotRadius: options.dotRadius || 1.2,
      dotAlpha: options.dotAlpha || 0.6,
      lineAlpha: options.lineAlpha || 0.12,
      ...options
    };

    this.handleResize = this.handleResize.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.animate = this.animate.bind(this);

    this.init();
  }

  init() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibility, { passive: true });
    this.createParticles();
    if (!document.hidden) {
      this.start();
    }
  }

  handleVisibility() {
    if (document.hidden) {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    } else {
      this.start();
    }
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement
      ? this.canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };

    this.width = rect.width || window.innerWidth || 360;
    this.height = rect.height || window.innerHeight || 540;

    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  createParticles() {
    this.particles = [];
    const count = this.options.particleCount;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.2 + Math.random() * 0.8) * this.options.baseSpeed;

      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: this.options.dotRadius * (0.85 + Math.random() * 0.3)
      });
    }
  }

  start() {
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  animate() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const maxDist = this.options.maxDistance;
    const maxDistSq = maxDist * maxDist;
    const invMaxDist = 1 / maxDist;
    const lineAlphaBase = this.options.lineAlpha;
    const particles = this.particles;
    const count = particles.length;
    const twoPi = Math.PI * 2;

    // 1. Update positions & batch all particle dots into a single GPU path fill
    ctx.fillStyle = `rgba(255, 255, 255, ${this.options.dotAlpha})`;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = w + 10;
      else if (p.x > w + 10) p.x = -10;

      if (p.y < -10) p.y = h + 10;
      else if (p.y > h + 10) p.y = -10;

      ctx.moveTo(p.x + p.radius, p.y);
      ctx.arc(p.x, p.y, p.radius, 0, twoPi);
    }
    ctx.fill();

    // 2. Draw constellation connection lines
    ctx.lineWidth = 0.75;
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      for (let j = i + 1; j < count; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxDistSq) {
          const alpha = (1 - Math.sqrt(distSq) * invMaxDist) * lineAlphaBase;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
          ctx.stroke();
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  }
}
