/**
 * config.js
 * 
 * Centralized configuration for the Trivia Platform.
 * Contains platform-wide settings and specific game configurations.
 */

module.exports = {
  // Server settings
  port: process.env.PORT || 3000,
  
  // Platform settings (shared across all game types)
  platform: {
    roomCodeLength: 4,
    roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // Avoid confusing characters like 0, O, 1, I
    reconnectionTimeout: 60000, // Time in ms to allow a player to reconnect (1 minute)
  },

  // Game-specific configurations
  games: {
    trivia: {
      // Game length
      questionsPerGame: 10,

      // Total time allowed to answer a question in seconds
      timeToAnswer: 10,
      
      // Time to show results and standby for next question (seconds)
      resultTime: 15,

      // Time to allow reading the question before the timer starts (seconds)
      readingBufferTime: 2,

      // Percentage marks for answer elimination (75%, 50%, 25% of time remaining)
      eliminationMarks: [0.75, 0.5, 0.25],
      
      // Scoring constants
      scoring: {
        basePoints: 100,      // Minimum points for a correct answer
        speedBonusMax: 900,   // Maximum additional points for speed
      }
    }
  }
};
