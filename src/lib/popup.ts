const GAP = 8;
const EDGE = 8;

export interface PopupPos {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;

  arrowOffset: number;

  above: boolean;
}


export function computePopupPos(
  anchor: DOMRect,
  popupWidth: number,
  estimatedHeight = 320,
): PopupPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;


  const idealLeft = anchor.left + anchor.width / 2 - popupWidth / 2;
  const left = Math.max(EDGE, Math.min(idealLeft, vw - popupWidth - EDGE));


  const anchorCx = anchor.left + anchor.width / 2;
  const arrowOffset = Math.max(12, Math.min(anchorCx - left, popupWidth - 12));


  const spaceBelow = vh - anchor.bottom - GAP;
  const spaceAbove = anchor.top - GAP;
  const above = spaceAbove > spaceBelow && spaceAbove >= Math.min(estimatedHeight, 120);

  if (above) {
    return {
      bottom: vh - anchor.top + GAP,
      left,
      maxHeight: Math.max(80, spaceAbove - EDGE),
      arrowOffset,
      above: true,
    };
  }
  return {
    top: anchor.bottom + GAP,
    left,
    maxHeight: Math.max(80, spaceBelow - EDGE),
    arrowOffset,
    above: false,
  };
}
