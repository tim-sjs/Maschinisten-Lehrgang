const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(process.cwd(), 'data', 'questions.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(fs.existsSync(DATA_PATH), `Missing generated data file: ${DATA_PATH}`);

  const questions = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  assert(Array.isArray(questions), 'Question data must be an array.');
  assert(questions.length === 105, `Expected 105 questions, got ${questions.length}.`);

  for (const question of questions) {
    assert(typeof question.id === 'number', 'Each question needs a numeric id.');
    assert(typeof question.question === 'string' && question.question.length > 0, `Question ${question.id} is missing text.`);
    assert(Array.isArray(question.options) && question.options.length >= 2, `Question ${question.id} has too few options.`);
    assert(
      Array.isArray(question.correctAnswers) && question.correctAnswers.length >= 1,
      `Question ${question.id} has no detected correct answer.`,
    );

    for (const answerIndex of question.correctAnswers) {
      assert(
        Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < question.options.length,
        `Question ${question.id} contains an invalid correct answer index.`,
      );
    }
  }

  console.log(`Question data OK (${questions.length} questions).`);
}

main();
