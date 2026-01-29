/**
 * PlatformEventBus.test.js
 * 
 * Tests for the centralized Event Bus that handles all internal communication.
 */

const PlatformEventBus = require('./PlatformEventBus');
const EventTypes = require('./EventTypes');

describe('PlatformEventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new PlatformEventBus();
  });

  test('should allow subscribing to and emitting events', (done) => {
    const testData = { roomCode: 'ABCD' };
    
    bus.on(EventTypes.CREATE_ROOM, (data) => {
      expect(data).toEqual(testData);
      done();
    });

    bus.emit(EventTypes.CREATE_ROOM, testData);
  });

  test('should support multiple subscribers for the same event', () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    bus.on(EventTypes.PLAYER_JOINED, callback1);
    bus.on(EventTypes.PLAYER_JOINED, callback2);

    bus.emit(EventTypes.PLAYER_JOINED, { name: 'Alice' });

    expect(callback1).toHaveBeenCalledWith({ name: 'Alice' });
    expect(callback2).toHaveBeenCalledWith({ name: 'Alice' });
  });

  test('should allow removing listeners', () => {
    const callback = jest.fn();
    
    bus.on(EventTypes.START_GAME, callback);
    bus.off(EventTypes.START_GAME, callback);
    
    bus.emit(EventTypes.START_GAME, {});
    
    expect(callback).not.toHaveBeenCalled();
  });
});
