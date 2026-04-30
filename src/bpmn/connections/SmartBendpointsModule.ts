// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SmartBendpoints(eventBus: any) {
  eventBus.on('bendpoint.move.start', 10000, (event: any) => {
    const context = event.context;
    if (!context || !context.connection || context.bendpointIndex === undefined) return;

    const isStart = context.bendpointIndex === 0;
    const isEnd = context.bendpointIndex === context.connection.waypoints.length - 1;

    // Intermediate corner — block. Endpoint — allow (reconnection).
    if (!isStart && !isEnd) {
      return false;
    }
  });
}
SmartBendpoints.$inject = ['eventBus'];
export default {
  __init__: ['smartBendpoints'],
  smartBendpoints: ['type', SmartBendpoints]
};
