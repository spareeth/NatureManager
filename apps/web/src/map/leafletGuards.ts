import L from 'leaflet';

// Leaflet 1.9: a canvas redraw scheduled with requestAnimationFrame can run after the renderer
// was destroyed (map removed while layers were still updating), and throws
// "Cannot read properties of undefined (reading 'clearRect')". Skip redraws without a context.
type CanvasInternals = {
  _ctx?: CanvasRenderingContext2D;
  _redrawRequest: number | null;
  _redraw: () => void;
};
const proto = L.Canvas.prototype as unknown as CanvasInternals;
const redraw = proto._redraw;
proto._redraw = function (this: CanvasInternals) {
  if (!this._ctx) {
    this._redrawRequest = null;
    return;
  }
  redraw.call(this);
};
