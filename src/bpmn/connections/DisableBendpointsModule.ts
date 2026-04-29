// Replaces BendpointMove with a no-op so individual waypoint drag handles
// (blue dots) are never functional. CSS hides them visually; this stub prevents
// Bendpoints.activateBendpointMove from throwing when it calls .start() on
// non-middle-segment clicks. ConnectionSegmentMove (segment pills) still works —
// it does not inject bendpointMove at all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NoBendpointMove(this: any) {
  // Bendpoints.js calls bendpointMove.start() for non-middle-segment clicks.
  // No-op prevents invisible waypoint drag behavior.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.start = function (_event: any, _connection: any, _index: any, _insert: any) {}
}
NoBendpointMove.$inject = []

export default {
  bendpointMove: ['type', NoBendpointMove],
}
