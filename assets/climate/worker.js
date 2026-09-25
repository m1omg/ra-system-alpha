// The climate's own thread. Physics runs in slices of a few milliseconds with a
// yield between them, so a message from the orrery -- a strike, an edit, the
// next frame's starlight -- is never more than one slice from being handled.
// When every world has spent its credit the loop stops until the next tick.
import { createHost } from './hostcore.js';

const host = createHost((msg, transfer) => self.postMessage(msg, transfer || []), () => kick());
const SLICE_MS = 10;
let running = false;
// A MessageChannel yields to the event loop without the 4 ms clamp nested
// timers get, so slices run back to back while there is work.
const ch = new MessageChannel();
ch.port1.onmessage = loop;

function kick() {
  if (running) return;
  running = true;
  ch.port2.postMessage(0);
}

function loop() {
  const pending = host.work(SLICE_MS);
  host.flush();
  if (pending) ch.port2.postMessage(0);
  else {
    running = false;
    // The last steps may have landed inside the post throttle; make sure the
    // orrery sees them even if no further tick arrives (a paused clock).
    if (host.isDirty()) setTimeout(() => host.flush(), 40);
  }
}

self.onmessage = (e) => {
  host.handle(e.data);
  if (e.data && e.data.type === 'impact') host.flush();   // before any physics slice
  kick();
};

host.ready();
