/**
 * ScoreCalculator.test.js
 * 
 * Tests for the ScoreCalculator logic, ensuring that points are awarded
 * correctly based on the remaining time.
 */

const ScoreCalculator = require('./ScoreCalculator');
const config = require('../../../config');


describe('ScoreCalculator', () => {
  let calculator;
  const timeToAnswer = config.games.trivia.timeToAnswer; // 10s

  beforeEach(() => {
    calculator = new ScoreCalculator();
  });

  test('should award maximum points for answering instantly', () => {
    // answertime = 0 (instantly)
    const points = calculator.calculate(0, timeToAnswer);
    expect(points).toBe(config.games.trivia.scoring.basePoints + config.games.trivia.scoring.speedBonusMax);
  });

  test('should award only base points if answering at the very last second', () => {
    const points = calculator.calculate(timeToAnswer, timeToAnswer);
    expect(points).toBe(config.games.trivia.scoring.basePoints);
  });

  test('should award approximately half the bonus for answering halfway', () => {
    const points = calculator.calculate(timeToAnswer / 2, timeToAnswer);
    const expected = config.games.trivia.scoring.basePoints + (config.games.trivia.scoring.speedBonusMax / 2);
    expect(points).toBeCloseTo(expected);
  });

  test('should award zero points for incorrect answers', () => {
    const points = calculator.calculate(1, timeToAnswer, false);
    expect(points).toBe(0);
  });

  test('should handle edge case where time elapsed exceeds limit', () => {
    const points = calculator.calculate(timeToAnswer + 5, timeToAnswer);
    expect(points).toBe(config.games.trivia.scoring.basePoints);
  });
});
