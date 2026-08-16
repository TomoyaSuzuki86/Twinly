export type SwipePoint = {
  x: number;
  y: number;
};

export type HorizontalSwipeDirection = "left" | "right";

const MIN_SWIPE_DISTANCE_PX = 56;
const HORIZONTAL_DOMINANCE_RATIO = 1.25;

export const detectHorizontalSwipe = (
  start: SwipePoint,
  end: SwipePoint
): HorizontalSwipeDirection | null => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (horizontalDistance < MIN_SWIPE_DISTANCE_PX) return null;
  if (horizontalDistance < verticalDistance * HORIZONTAL_DOMINANCE_RATIO) return null;

  return deltaX < 0 ? "left" : "right";
};
