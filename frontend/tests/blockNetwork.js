// Refuses every outgoing connection from unit tests. In Vitest's Node workers,
// fetch, XMLHttpRequest and WebSocket all connect through this method.
import net from 'node:net';
import { setImmediate } from 'node:timers';

const PATCHED = Symbol.for('resumecraft.blockNetwork');

if (!net.Socket.prototype[PATCHED]) {
  net.Socket.prototype[PATCHED] = true;

  net.Socket.prototype.connect = function blockedConnect() {
    // Fail later, like a real connection, so callers can attach listeners.
    this.connecting = true;
    setImmediate(() => {
      const error = new Error('Unit tests must not open network connections');
      error.code = 'ERR_TEST_NETWORK_BLOCKED';
      this.destroy(error);
    });
    return this;
  };
}
