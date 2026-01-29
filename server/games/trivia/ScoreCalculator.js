/**
 * ScoreCalculator.js
 * 
 * Handles calculating player scores based on accuracy and speed.
 */

const config = require("../../../config");

class ScoreCalculator {
  /**
   * Calculates points awarded for an answer.
   * @param {number} timeElapsed - Seconds elapsed since question started.
   * @param {number} totalTime - Total seconds allowed for the question.
   * @param {boolean} isCorrect - Whether the answer was correct.
   * @returns {number} Calculated points.
   */
  calculate(timeElapsed, totalTime, isCorrect) {
    if (!isCorrect) {
      return 0;
    }

    // Ensure timeElapsed is clamped between 0 and totalTime
    const clampedTime = Math.max(0, Math.min(timeElapsed, totalTime));
    
    // Percentage of time remaining (1.0 = instant, 0.0 = last second)
    const timeFactor = (totalTime - clampedTime) / totalTime;
    
    const base = config.games.trivia.scoring.basePoints;
    const bonus = config.games.trivia.scoring.speedBonusMax;

    return Math.floor(base + (bonus * timeFactor));
  }
}

module.exports = ScoreCalculator;
