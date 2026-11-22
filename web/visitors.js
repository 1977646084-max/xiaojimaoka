const random = (max) => Math.random() * Math.max(0, max);
const active = new WeakMap();

export async function animateArrival(stage, queue, layer) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
  const scene = stage.getBoundingClientRect();
  const slots = [...queue.children];
  const arrival = Symbol();
  active.set(queue, arrival);
  queue.classList.add('arriving');
  layer.replaceChildren();
  const animations = slots.map((slot, index) => {
    const rect = slot.getBoundingClientRect();
    const sprite = document.createElement('i');
    sprite.className = `guest-sprite palette-${index % 3}`;
    layer.append(sprite);
    const end = `translate(${rect.left - scene.left}px, ${rect.top - scene.top}px)`;
    const path = Array.from({ length: 5 }, () =>
      `translate(${random(scene.width - rect.width)}px, ${random(scene.height - rect.height)}px)`,
    );
    const motion = sprite.animate([...path, end].map((transform) => ({ transform })), {
      duration: 1150 + random(450), easing: 'ease-in-out', fill: 'both',
    });
    return motion.finished.finally(() => sprite.remove());
  });
  await Promise.allSettled(animations);
  if (active.get(queue) === arrival) queue.classList.remove('arriving');
}
