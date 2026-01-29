/**
 * InMemoryGameRepository.test.js
 * 
 * Tests for the InMemoryGameRepository, which provides a volatile
 * storage for game rooms and player states.
 */

const InMemoryGameRepository = require('./InMemoryGameRepository');

describe('InMemoryGameRepository', () => {
  let repository;

  beforeEach(() => {
    repository = new InMemoryGameRepository();
  });

  test('should create and check for room existence', async () => {
    const roomCode = 'TEST';
    expect(await repository.exists(roomCode)).toBe(false);
    
    await repository.createRoom(roomCode);
    expect(await repository.exists(roomCode)).toBe(true);
  });

  test('should save and retrieve room state', async () => {
    const roomCode = 'PLAY';
    const state = { phase: 'LOBBY', players: [] };
    
    await repository.createRoom(roomCode);
    await repository.saveState(roomCode, state);
    
    const retrieved = await repository.getState(roomCode);
    expect(retrieved).toEqual(state);
  });

  test('should return null when getting state for non-existent room', async () => {
    const state = await repository.getState('NONE');
    expect(state).toBeNull();
  });

  test('should not save state for non-existent room', async () => {
    await repository.saveState('NONE', { some: 'state' });
    expect(await repository.getState('NONE')).toBeNull();
  });


  test('should delete a room', async () => {
    const roomCode = 'GONE';
    await repository.createRoom(roomCode);
    await repository.deleteRoom(roomCode);
    expect(await repository.exists(roomCode)).toBe(false);
  });
});
