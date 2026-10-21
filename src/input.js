export function createInput(target = window) {
  const down = new Set();
  const pressed = new Set();

  target.addEventListener("keydown", (event) => {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)
    ) {
      event.preventDefault();
    }

    if (!event.repeat) {
      pressed.add(event.code);
    }

    down.add(event.code);
  });

  target.addEventListener("keyup", (event) => {
    down.delete(event.code);
  });

  target.addEventListener("blur", () => {
    down.clear();
    pressed.clear();
  });

  return {
    isDown(code) {
      return down.has(code);
    },

    justPressed(code) {
      return pressed.has(code);
    },

    endFrame() {
      pressed.clear();
    },
  };
}
