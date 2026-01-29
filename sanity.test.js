/**
 * sanity.test.js
 * 
 * A simple test to verify that the testing environment is correctly configured.
 */

describe('Sanity Check', () => {
  test('should pass if 1 + 1 is 2', () => {
    expect(1 + 1).toBe(2);
  });

  test('should be able to require config', () => {
    const config = require('./config');
    expect(config).toBeDefined();
    expect(config.platform).toBeDefined();
    expect(config.games.trivia.timeToAnswer).toBe(10);
  });
});
