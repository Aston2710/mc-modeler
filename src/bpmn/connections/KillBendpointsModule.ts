// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KillBendpoints(eventBus: any) {
  // Prioridad 10000 para matar el evento antes que diagram-js
  eventBus.on('bendpoint.move.start', 10000, () => {
    return false;
  });
}
KillBendpoints.$inject = ['eventBus'];
export default {
  __init__: ['killBendpoints'],
  killBendpoints: ['type', KillBendpoints]
};
