/**
 * Nabla Design System — Constellation Particle Canvas
 * Lightweight, high-performance geometric particle canvas.
 * Draws slow-moving white nodes connected by subtle low-opacity lines.
 */

export class ParticleConstellation {
  constructor(canvasElement, options = {}) {
    if (!canvasElement) return;

    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.particles = [];
    this.animationFrameId = null;

    this.options = {
      particleCount: options.particleCount || 45,
      maxDistance: options.maxDistance || 90,
      baseSpeed: options.baseSpeed || 0.35,
      dotRadius: options.dotRadius || 1.2,
      dotAlpha: options.dotAlpha || 0.65,
      lineAlpha: options.lineAlpha || 0.12,
      color: options.color || '#FFFFFF',
      ...options
    };

    this.handleResize = this.handleResize.bind(this);
    this.animate = this.animate.bind(this);

    this.init();
  }

  init() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize, { passive: true });
    this.createParticles();
    this.start();
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement
      ? this.canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };

    this.width = rect.width || window.innerWidth || 360;
    this.height = rect.height || window.innerHeight || 540;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.scale(dpr, dpr);
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
        radius: this.options.dotRadius * (0.8 + Math.random() * 0.4),
        alpha: this.options.dotAlpha * (0.6 + Math.random() * 0.4)
      });
    }
  }

  start() {
    if (!this.animationFrameId) {
      this.animate();
    }
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize);
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const maxDist = this.options.maxDistance;
    const maxDistSq = maxDist * maxDist;
    const count = this.particles.length;

    // Update & draw particles
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];

      p.x += p.vx;
      p.y += p.vy;

      // Wrap-around gently
      if (p.x < -10) p.x = this.width + 10;
      else if (p.x > this.width + 10) p.x = -10;

      if (p.y < -10) p.y = this.height + 10;
      else if (p.y > this.height + 10) p.y = -10;

      // Draw particle dot
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      this.ctx.fill();

      // Connect with neighboring particles
      for (let j = i + 1; j < count; j++) {
        const p2 = this.particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxDistSq) {
          const proximity = 1 - Math.sqrt(distSq) / maxDist;
          const alpha = proximity * this.options.lineAlpha;

          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          this.ctx.lineWidth = 0.75;
          this.ctx.stroke();
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  }
}
