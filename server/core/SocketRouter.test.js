/**
 * SocketRouter.test.js
 * 
 * Tests for the SocketRouter, which bridges WebSocket messages to the internal Event Bus.
 */

const SocketRouter = require('./SocketRouter');
const EventTypes = require('./EventTypes');

describe('SocketRouter', () => {
  let router;
  let mockBus;
  let mockSocket;
  let mockIO;

  beforeEach(() => {
    mockBus = {
      emit: jest.fn(),
      on: jest.fn()
    };
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    mockSocket = {
      id: 'socket-123',
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
      to: jest.fn().mockReturnThis()
    };
    
    router = new SocketRouter(mockIO, mockBus);
  });

  test('should register basic socket commands on connection', () => {
    router.registerSocket(mockSocket);
    
    expect(mockSocket.on).toHaveBeenCalledWith(EventTypes.CMD_CREATE_ROOM, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(EventTypes.CMD_JOIN_ROOM, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(EventTypes.CMD_START_GAME, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(EventTypes.CMD_SUBMIT_ANSWER, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  test('should bridge socket CMDs to the bus', () => {
    router.registerSocket(mockSocket);

    const testCMDs = [
      { name: EventTypes.CMD_CREATE_ROOM, data: {} },
      { name: EventTypes.CMD_JOIN_ROOM, data: { roomCode: 'A' } },
      { name: EventTypes.CMD_START_GAME, data: { roomCode: 'A' } },
      { name: EventTypes.CMD_SUBMIT_ANSWER, data: { roomCode: 'A', index: 0 } }
    ];

    testCMDs.forEach(cmd => {
      const callback = mockSocket.on.mock.calls.find(call => call[0] === cmd.name)[1];
      callback(cmd.data);
      
      expect(mockBus.emit).toHaveBeenCalledWith(cmd.name, expect.objectContaining({
        socketId: mockSocket.id
      }));
    });
  });

  test('should listen to internal EVTs and broadcast to sockets', () => {
    router.init();
    
    const testEVTs = [
      { type: EventTypes.EVT_PLAYER_JOINED, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_ROOM_CREATED, data: { roomCode: 'B' }, broadcast: false },
      { type: EventTypes.EVT_GAME_STARTED, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_NEXT_QUESTION, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_ELIMINATE_OPTION, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_ANSWER_ACCEPTED, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_QUESTION_RESULTS, data: { roomCode: 'A' }, broadcast: true },
      { type: EventTypes.EVT_GAME_OVER, data: { roomCode: 'A' }, broadcast: true }
    ];

    testEVTs.forEach(evt => {
      const callback = mockBus.on.mock.calls.find(call => call[0] === evt.type)[1];
      callback(evt.data);
      
      if (evt.broadcast) {
        expect(mockIO.to).toHaveBeenCalledWith(evt.data.roomCode);
      }
      expect(mockIO.emit).toHaveBeenCalledWith(evt.type, evt.data);
    });
  });
});
