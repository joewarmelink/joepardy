/**
 * PlatformEventBus.js
 * 
 * A centralized event bus using Node.js EventEmitter.
 * Decouples network communication from game logic.
 */

const EventEmitter = require('events');

class PlatformEventBus extends EventEmitter {
  /**
   * Initializes the event bus.
   */
  constructor() {
    super();
  }

  /**
   * Alias for addListener.
   * @param {string} event 
   * @param {Function} listener 
   */
  on(event, listener) {
    return super.on(event, listener);
  }

  /**
   * Alias for removeListener.
   * @param {string} event 
   * @param {Function} listener 
   */
  off(event, listener) {
    return super.removeListener(event, listener);
  }

  /**
   * Emits an event with data.
   * @param {string} event 
   * @param {any} data 
   */
  emit(event, data) {
    return super.emit(event, data);
  }
}

module.exports = PlatformEventBus;
