export function connectFiles(root: HTMLElement) {
  const scene = root.querySelector<HTMLElement>(".fh-scene");
  const wires = root.querySelector<SVGGElement>("[data-connections]");
  const editor = root.querySelector<HTMLElement>(".fh-editor");
  const harness = root.querySelector<HTMLElement>(".fh-harness");
  const files = [...root.querySelectorAll<HTMLElement>("[data-file]")];
  const destinations = [...root.querySelectorAll<HTMLElement>("[data-capability]")];
  if (!scene || !wires || !editor || !harness) return () => {};
  const packets = files.map((_, index) => {
    const packet = document.createElement("div");
    packet.className = "fh-file-packet";
    packet.setAttribute("aria-hidden", "true");
    packet.innerHTML = `<svg viewBox="0 0 22 28"><path d="M3 1h10l6 6v19H3Z M13 1v7h6 M6 13h10 M6 17h10 M6 21h6"/></svg><span>${index === 2 ? "TS" : "MD"}</span>`;
    packet.style.animationDelay = `${index * 0.85}s`;
    scene.append(packet);
    return packet;
  });
  function draw() {
    if (!scene || !wires || !editor || !harness) return;
    if (matchMedia("(max-width: 900px)").matches) {
      wires.innerHTML = "";
      return;
    }
    const bounds = scene.getBoundingClientRect();
    const from = editor.getBoundingClientRect(),
      to = harness.getBoundingClientRect();
    const paths = files.map((file, index) => {
      const a = file.getBoundingClientRect();
      const b = (destinations[index] ?? harness).getBoundingClientRect();
      const x1 = from.right - bounds.left,
        y1 = a.top + a.height / 2 - bounds.top;
      const x2 = to.left - bounds.left,
        y2 = b.top + b.height / 2 - bounds.top;
      const path = `M${x1} ${y1} C${x1 + (x2 - x1) * 0.48} ${y1} ${x2 - (x2 - x1) * 0.48} ${y2} ${x2} ${y2}`;
      const packet = packets[index];
      if (packet) packet.style.offsetPath = `path("${path}")`;
      return `<path d="${path}"/><path class="fh-wire-signal" pathLength="100" d="${path}"/>`;
    });
    wires.innerHTML = paths.join("");
  }
  const observer = new ResizeObserver(draw);
  observer.observe(scene);
  document.fonts.ready.then(draw);
  draw();
  return () => {
    observer.disconnect();
    packets.forEach((packet) => {
      packet.remove();
    });
  };
}
