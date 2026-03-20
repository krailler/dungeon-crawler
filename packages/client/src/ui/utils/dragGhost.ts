/** Invisible 1x1 image used to hide the default browser drag ghost */
export const EMPTY_DRAG_IMG = (() => {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
  return img;
})();
