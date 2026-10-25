// Turns page scrolling into a smoothed 0–1 progress value for whichever
// scene is currently scroll-driven. Scenes that aren't scroll-driven
// lock the page so the wheel doesn't move anything.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export class ScrollDriver {
  constructor() {
    this.spacer = document.getElementById("scroll-spacer");
    this.target = 0;
    this.value = 0;
    this.active = false;
    window.addEventListener("scroll", () => this.read(), { passive: true });
    window.addEventListener("resize", () => this.read());
  }

  // Make the page `screens` screen-heights tall and start at `start` (0–1).
  enable(screens, start = 0) {
    this.active = true;
    document.body.classList.remove("no-scroll");
    this.spacer.style.height = `${(screens + 1) * 100}vh`;
    const max = this.max();
    window.scrollTo(0, start * max);
    this.target = this.value = start;
  }

  disable() {
    this.active = false;
    this.spacer.style.height = "0";
    document.body.classList.add("no-scroll");
    window.scrollTo(0, 0);
  }

  max() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  read() {
    if (!this.active) return;
    this.target = Math.min(1, Math.max(0, window.scrollY / this.max()));
  }

  update(dt) {
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 6);
    this.value += (this.target - this.value) * k;
    if (Math.abs(this.target - this.value) < 1e-5) this.value = this.target;
    return this.value;
  }
}
