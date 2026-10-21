export function createLoop({ step = 1 / 60, simulate, render }) {
  let running = false;
  let animationId = 0;
  let lastTime = 0;
  let accumulator = 0;

  let previous = null;
  let current = null;

  let stepsInSecond = 0;
  let framesInSecond = 0;
  let secondStarted = 0;

  let stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTime: 0,
  };

  function frame(now) {
    if (!running) return;

    const frameStart = performance.now();

    if (lastTime === 0) {
      lastTime = now;
      secondStarted = now;
    }

    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    accumulator += elapsed;

    while (accumulator >= step) {
      previous = current ? { ...current } : null;

      simulate(step);

      current = current ? { ...current } : null;
      accumulator -= step;
      stepsInSecond++;
    }

    const alpha = accumulator / step;

    render(alpha);

    framesInSecond++;

    if (now - secondStarted >= 1000) {
      stats = {
        stepsPerSecond: stepsInSecond,
        framesPerSecond: framesInSecond,
        frameTime: performance.now() - frameStart,
      };

      stepsInSecond = 0;
      framesInSecond = 0;
      secondStarted = now;
    } else {
      stats.frameTime = performance.now() - frameStart;
    }

    animationId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;

      running = true;
      lastTime = 0;
      accumulator = 0;
      animationId = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      cancelAnimationFrame(animationId);
    },

    getStats() {
      return { ...stats };
    },

    resetInterpolation(state) {
      previous = { ...state };
      current = { ...state };
    },

    getInterpolation() {
      return {
        previous: previous ? { ...previous } : null,
        current: current ? { ...current } : null,
      };
    },
  };
}
