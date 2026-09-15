const QUESTION_COUNT = 20;
const PASS_PERCENTAGE = 50;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const state = {
  allQuestions: Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [],
  currentQuiz: [],
};

function shuffle(list) {
  const copy = [...list];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function isSameAnswerSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function createOptionRow({ inputName, inputValue, text, checked, disabled, extraClass }) {
  const row = document.createElement('label');
  row.className = `option-row${extraClass ? ` ${extraClass}` : ''}`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = inputName;
  input.value = String(inputValue);
  input.checked = checked;
  input.disabled = disabled;

  const textSpan = document.createElement('span');
  textSpan.className = 'option-label';
  textSpan.textContent = text;

  row.append(input, textSpan);
  return row;
}

function renderTabs() {
  const buttons = document.querySelectorAll('[data-tab-target]');
  const panels = document.querySelectorAll('.tab-panel');

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-tab-target');

      for (const panel of panels) {
        panel.classList.toggle('is-active', panel.id === targetId);
      }

      for (const currentButton of buttons) {
        currentButton.classList.toggle('is-active', currentButton === button);
      }
    });
  }
}

function renderQuiz() {
  const quizForm = document.getElementById('quiz-form');
  const resultCard = document.getElementById('quiz-result');

  state.currentQuiz = shuffle(state.allQuestions).slice(0, QUESTION_COUNT);
  quizForm.innerHTML = '';
  resultCard.className = 'result-card hidden';
  resultCard.innerHTML = '';

  state.currentQuiz.forEach((question, questionIndex) => {
    const card = document.createElement('article');
    card.className = 'question-card';

    const meta = document.createElement('div');
    meta.className = 'question-meta';
    meta.textContent = `Frage ${question.id} • Quizfrage ${questionIndex + 1} von ${state.currentQuiz.length}`;

    const title = document.createElement('h3');
    title.textContent = question.question;

    const hint = document.createElement('p');
    hint.className = 'option-hint';
    hint.textContent = 'Mehrere Antworten können richtig sein.';

    const optionList = document.createElement('div');
    optionList.className = 'option-list';

    question.options.forEach((optionText, optionIndex) => {
      optionList.appendChild(
        createOptionRow({
          inputName: `question-${question.id}`,
          inputValue: optionIndex,
          text: `${LETTERS[optionIndex]}. ${optionText}`,
          checked: false,
          disabled: false,
        }),
      );
    });

    card.append(meta, title, hint, optionList);
    quizForm.appendChild(card);
  });
}

function renderCatalog(filterValue = '') {
  const catalogList = document.getElementById('catalog-list');
  const normalizedFilter = filterValue.trim().toLowerCase();

  const matchingQuestions = state.allQuestions.filter((question) => {
    if (!normalizedFilter) {
      return true;
    }

    const searchText = `${question.id} ${question.question} ${question.options.join(' ')}`.toLowerCase();
    return searchText.includes(normalizedFilter);
  });

  catalogList.innerHTML = '';

  matchingQuestions.forEach((question) => {
    const card = document.createElement('article');
    card.className = 'question-card';

    const meta = document.createElement('div');
    meta.className = 'question-meta';
    meta.textContent = `Frage ${question.id}`;

    const title = document.createElement('h3');
    title.textContent = question.question;

    const optionList = document.createElement('div');
    optionList.className = 'option-list';

    question.options.forEach((optionText, optionIndex) => {
      optionList.appendChild(
        createOptionRow({
          inputName: `catalog-${question.id}`,
          inputValue: optionIndex,
          text: `${LETTERS[optionIndex]}. ${optionText}`,
          checked: question.correctAnswers.includes(optionIndex),
          disabled: true,
          extraClass: question.correctAnswers.includes(optionIndex) ? 'correct-answer' : '',
        }),
      );
    });

    card.append(meta, title, optionList);
    catalogList.appendChild(card);
  });
}

function evaluateQuiz(event) {
  event.preventDefault();

  const quizForm = document.getElementById('quiz-form');
  const resultCard = document.getElementById('quiz-result');
  let correctCount = 0;

  state.currentQuiz.forEach((question) => {
    const selectedAnswers = Array.from(
      quizForm.querySelectorAll(`input[name="question-${question.id}"]:checked`),
      (input) => Number(input.value),
    ).sort((a, b) => a - b);

    const isCorrect = isSameAnswerSet(selectedAnswers, question.correctAnswers);

    if (isCorrect) {
      correctCount += 1;
    }

    const rows = quizForm.querySelectorAll(`input[name="question-${question.id}"]`);
    rows.forEach((input) => {
      const optionIndex = Number(input.value);
      const row = input.closest('.option-row');
      const isRightAnswer = question.correctAnswers.includes(optionIndex);
      const wasSelected = selectedAnswers.includes(optionIndex);

      row.classList.remove('answer-correct', 'answer-wrong');

      if (isRightAnswer) {
        row.classList.add('answer-correct');
      } else if (wasSelected) {
        row.classList.add('answer-wrong');
      }
    });
  });

  const percent = Math.round((correctCount / state.currentQuiz.length) * 100);
  const passed = percent >= PASS_PERCENTAGE;

  resultCard.className = `result-card ${passed ? 'pass' : 'fail'}`;
  resultCard.innerHTML = `
    <h3>${passed ? 'Bestanden' : 'Nicht bestanden'}</h3>
    <p class="result-meta">Du hast ${correctCount} von ${state.currentQuiz.length} Fragen richtig beantwortet.</p>
    <p class="result-meta">Ergebnis: ${percent} % • Bestehensgrenze: ${PASS_PERCENTAGE} %</p>
  `;
}

function wireEvents() {
  document.getElementById('quiz-form').addEventListener('submit', evaluateQuiz);
  document.getElementById('new-quiz-button').addEventListener('click', renderQuiz);
  document.getElementById('catalog-filter').addEventListener('input', (event) => {
    renderCatalog(event.target.value);
  });
}

function init() {
  if (state.allQuestions.length === 0) {
    throw new Error('Keine Fragen geladen.');
  }

  renderTabs();
  renderQuiz();
  renderCatalog();
  wireEvents();
}

init();
