/**
 * OpenTDBProvider.js
 * 
 * Implementation of a trivia question provider using the Open Trivia Database API.
 * Maps OTDB JSON response to our internal TriviaQuestion model.
 */

const he = require('he');

class OpenTDBProvider {
  /**
   * Initializes the provider.
   */
  constructor() {
    this.apiUrl = 'https://opentdb.com/api.php';
  }

  /**
   * Fetches multiple-choice questions from OTDB.
   * @param {number} amount - Number of questions to fetch.
   * @returns {Promise<Array>} Array of formatted TriviaQuestion objects.
   */
  async getQuestions(amount = 10) {
    const url = `${this.apiUrl}?amount=${amount}&type=multiple`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch trivia questions');
    }

    const data = await response.json();
    if (data.response_code !== 0) {
      throw new Error(`OTDB API returned error code: ${data.response_code}`);
    }

    return data.results.map(q => this._formatQuestion(q));
  }

  /**
   * Transforms an OTDB question object into our internal format.
   * Shuffles the correct answer into the list of incorrect ones.
   * @private
   * @param {Object} rawQ - The raw question from OTDB.
   * @returns {Object}
   */
  _formatQuestion(rawQ) {
    // Combine correct and incorrect answers
    const options = [...rawQ.incorrect_answers, rawQ.correct_answer];
    
    // Shuffle options using Fisher-Yates
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    // Find the new index of the correct answer
    const correctIndex = options.indexOf(rawQ.correct_answer);

    return {
      question: this._decodeHtml(rawQ.question),
      category: this._decodeHtml(rawQ.category),
      difficulty: rawQ.difficulty,
      options: options.map(opt => this._decodeHtml(opt)),
      correctIndex: correctIndex
    };
  }

  /**
   * Decodes HTML entities using the 'he' library.
   * @private
   * @param {string} html 
   * @returns {string}
   */
  _decodeHtml(html) {
    if (!html) return '';
    return he.decode(html);
  }
}

module.exports = OpenTDBProvider;
