/** Top-down ambulance, drawn pointing north so marker rotation equals the route bearing. */
export const AMBULANCE_SVG = `
<svg class="amb-svg" width="16" height="34" viewBox="0 0 16 34" aria-hidden="true">
  <rect x="0.75" y="0.75" width="14.5" height="32.5" rx="2" fill="#FFFFFF" stroke="#171717" stroke-width="1.2"/>
  <rect x="2.4" y="2.2" width="11.2" height="4.6" rx="1" fill="#171717" opacity="0.85"/>
  <rect x="1.5" y="12.5" width="13" height="2.6" fill="#0B6B3A"/>
  <rect x="1.5" y="25" width="13" height="2.6" fill="#0B6B3A"/>
  <rect class="amb-l1" x="2.2" y="8.2" width="5.6" height="2.4" fill="#C8261D"/>
  <rect class="amb-l2" x="8.2" y="8.2" width="5.6" height="2.4" fill="#FFFFFF" stroke="#171717" stroke-width="0.4"/>
  <path d="M8 17.2v6.2M4.9 20.3h6.2" stroke="#C8261D" stroke-width="2"/>
</svg>`

export function makeAmbulanceEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'amb-marker'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', 'Ambulance')
  el.innerHTML = `<div class="amb-scale">${AMBULANCE_SVG}</div>`
  return el
}

export function setAmbulanceScale(el: HTMLElement, zoom: number) {
  const s = Math.max(0.65, Math.min(1.5, 2 ** ((zoom - 14) * 0.35)))
  const inner = el.firstElementChild as HTMLElement | null
  if (inner) inner.style.transform = `scale(${s.toFixed(3)})`
}

export function setLights(el: HTMLElement, on: boolean) {
  el.classList.toggle('lights-off', !on)
}
