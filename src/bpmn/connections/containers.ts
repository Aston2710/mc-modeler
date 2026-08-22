/**
 * Contenedores de routing: elementos que AGRUPAN otros elementos en vez de
 * competir con ellos por el espacio del canvas.
 *
 * Un Participant/Lane/Group nunca es un obstáculo ni "se planta encima" de una
 * flecha: la CONTIENE. Tratarlo como shape sólido rompe dos capas:
 *  - el router lo esquivaría (todas las rutas internas rodearían el pool),
 *  - la Capa 4 de OrthogonalityBehavior re-rutearía todas las flechas de dentro
 *    al mover el pool (su bbox las invade por definición).
 *
 * Ver EXP-010 (docs/experience/010-mover-contenedor-reruta-las-flechas-internas.md),
 * §Causa raíz A.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any

export function isRoutingContainer(el: Element): boolean {
  const bo = el?.businessObject
  if (!bo || typeof bo.$instanceOf !== 'function') return false
  return bo.$instanceOf('bpmn:Participant')
      || bo.$instanceOf('bpmn:Lane')
      || bo.$instanceOf('bpmn:Group')
}
