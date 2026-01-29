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
    const initialState = { players: {} };
    
    mockRepository.getState.mockResolvedValue(initialState);
    mockRepository.saveState.mockResolvedValue(undefined);

    const success = await roomManager.joinRoom(roomCode, player);
    
    expect(success).toBe(true);
    expect(mockRepository.saveState).toHaveBeenCalledWith(roomCode, {
      players: {
        'user-1': player
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
});
