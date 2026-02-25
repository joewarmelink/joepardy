/**
 * RoomManager.test.js
 * 
 * Tests for the RoomManager class, responsible for managing game rooms,
 * generating unique room codes, and tracking players.
 */

const RoomManager = require('./RoomManager');
const config = require('../../config');

describe('RoomManager', () => {
  let roomManager;
  let mockRepository;

  beforeEach(() => {
    // Create a mock repository to isolate RoomManager logic
    mockRepository = {
      exists: jest.fn(),
      createRoom: jest.fn(),
      getState: jest.fn(),
      saveState: jest.fn(),
      deleteRoom: jest.fn()
    };
    roomManager = new RoomManager(mockRepository);
  });

  test('should create a room with a 4-character code using the allowed alphabet', async () => {
    mockRepository.exists.mockResolvedValue(false);
    mockRepository.createRoom.mockResolvedValue(undefined);

    const roomCode = await roomManager.createRoom();
    
    // Check length
    expect(roomCode).toHaveLength(config.platform.roomCodeLength);
    
    // Check that every character is in the alphabet
    const alphabet = config.platform.roomCodeAlphabet;
    for (const char of roomCode) {
      expect(alphabet).toContain(char);
    }

    // Verify repository was called
    expect(mockRepository.exists).toHaveBeenCalledWith(roomCode);
    expect(mockRepository.createRoom).toHaveBeenCalledWith(roomCode);
  });

  test('should retry if generated room code already exists (collision handling)', async () => {
    // First call returns true (exists), second call returns false (available)
    mockRepository.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    
    const roomCode = await roomManager.createRoom();
    
    expect(mockRepository.exists).toHaveBeenCalledTimes(2);
    expect(mockRepository.createRoom).toHaveBeenCalledTimes(1);
    expect(roomCode).toBeDefined();
  });

  test('should allow a player to join a room', async () => {
    const roomCode = 'JOIN';
    const player = { uuid: 'user-1', name: 'Alice' };
    const socketId = 'socket-123';
    const initialState = { players: {} };
    
    mockRepository.getState.mockResolvedValue(initialState);
    mockRepository.saveState.mockResolvedValue(undefined);

    const success = await roomManager.joinRoom(roomCode, player, socketId);
    
    expect(success).toBe(true);
    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'user-1': {
          uuid: 'user-1',
          name: 'Alice',
          role: 'player',
          socketId: 'socket-123'
        }
      }
    });
  });

  test('should return false when joining a non-existent room', async () => {
    mockRepository.getState.mockResolvedValue(null);
    const success = await roomManager.joinRoom('NULL', { uuid: '1', name: 'X' });
    expect(success).toBe(false);
  });

  test('should track players by UUID for reconnection', async () => {
    const roomCode = 'RECO';
    const player = { uuid: 'uuid-123', name: 'Bob' };
    const state = { players: { 'uuid-123': player } };
    
    mockRepository.getState.mockResolvedValue(state);

    const foundPlayer = await roomManager.getPlayerByUuid(roomCode, 'uuid-123');
    expect(foundPlayer).toEqual(player);
  });

  test('should remove a room', async () => {
    const roomCode = 'DEL';
    mockRepository.deleteRoom.mockResolvedValue(undefined);
    
    await roomManager.removeRoom(roomCode);
    expect(mockRepository.deleteRoom).toHaveBeenCalledWith(roomCode);
  });

  test('should return all players in a room', async () => {
    const roomCode = 'LIST';
    const players = { 'u1': { name: 'Alice' }, 'u2': { name: 'Bob' } };
    mockRepository.getState.mockResolvedValue({ players });

    const result = await roomManager.getPlayers(roomCode);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ name: 'Alice' });
  });

  test('should return undefined if room does not exist when listing players', async () => {
    mockRepository.getState.mockResolvedValue(null);
    const result = await roomManager.getPlayers('NONE');
    expect(result).toBeUndefined();
  });

  test('should return undefined if room does not exist when getting player by UUID', async () => {
    mockRepository.getState.mockResolvedValue(null);
    const result = await roomManager.getPlayerByUuid('NONE', 'any');
    expect(result).toBeUndefined();
  });

  test('should mark a player as disconnected', async () => {
    const roomCode = 'DISC';
    const playerUuid = 'uuid-456';
    const state = {
      players: {
        'uuid-456': { uuid: 'uuid-456', name: 'Charlie', socketId: 'socket-789' }
      }
    };

    mockRepository.getState.mockResolvedValue(state);
    mockRepository.saveState.mockResolvedValue(undefined);

    const result = await roomManager.markPlayerDisconnected(roomCode, playerUuid);

    expect(result).toBe(true);
    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'uuid-456': { uuid: 'uuid-456', name: 'Charlie', socketId: null }
      }
    });
  });

  test('should return false when marking disconnection for non-existent room', async () => {
    mockRepository.getState.mockResolvedValue(null);
    const result = await roomManager.markPlayerDisconnected('NONE', 'uuid-123');
    expect(result).toBe(false);
  });

  test('should return false when marking disconnection for non-existent player', async () => {
    const state = { players: {} };
    mockRepository.getState.mockResolvedValue(state);
    const result = await roomManager.markPlayerDisconnected('TEST', 'uuid-999');
    expect(result).toBe(false);
  });

  test('should update existing player on rejoin with new socketId', async () => {
    const roomCode = 'REJN';
    const playerUuid = 'uuid-100';
    const state = {
      players: {
        'uuid-100': { uuid: 'uuid-100', name: 'OldName', role: 'player', socketId: null }
      }
    };

    mockRepository.getState.mockResolvedValue(state);
    mockRepository.saveState.mockResolvedValue(undefined);

    const success = await roomManager.joinRoom(roomCode, { uuid: playerUuid, name: 'NewName' }, 'socket-new');

    expect(success).toBe(true);
    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'uuid-100': { uuid: 'uuid-100', name: 'NewName', role: 'player', socketId: 'socket-new' }
      }
    });
  });

  test('should assign default role of player when joining', async () => {
    const roomCode = 'ROLE';
    const player = { uuid: 'user-99', name: 'DefaultRole' };
    const socketId = 'socket-999';
    const initialState = { players: {} };

    mockRepository.getState.mockResolvedValue(initialState);
    mockRepository.saveState.mockResolvedValue(undefined);

    await roomManager.joinRoom(roomCode, player, socketId);

    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'user-99': {
          uuid: 'user-99',
          name: 'DefaultRole',
          role: 'player',
          socketId: 'socket-999'
        }
      }
    });
  });

  test('should preserve custom role when joining', async () => {
    const roomCode = 'HOST';
    const player = { uuid: 'host-1', name: 'HostUser', role: 'host' };
    const socketId = 'socket-host';
    const initialState = { players: {} };

    mockRepository.getState.mockResolvedValue(initialState);
    mockRepository.saveState.mockResolvedValue(undefined);

    await roomManager.joinRoom(roomCode, player, socketId);

    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'host-1': {
          uuid: 'host-1',
          name: 'HostUser',
          role: 'host',
          socketId: 'socket-host'
        }
      }
    });
  });

  test('should retrieve room state', async () => {
    const roomCode = 'STAT';
    const state = { players: {}, phase: 'PLAYING' };
    mockRepository.getState.mockResolvedValue(state);

    const result = await roomManager.getState(roomCode);

    expect(result).toEqual(state);
    expect(mockRepository.getState).toHaveBeenCalledWith(roomCode);
  });
});
