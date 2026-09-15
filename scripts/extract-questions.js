const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
const { PDFParse } = require('pdf-parse');
const { PNG } = require('pngjs');

const ROOT = process.cwd();
const PDF_PATH = path.join(ROOT, 'MA_Fragenkatalog.pdf');
const DATA_DIR = path.join(ROOT, 'data');
const JSON_PATH = path.join(DATA_DIR, 'questions.json');
const JS_PATH = path.join(ROOT, 'questions-data.js');
const HIGHLIGHT_THRESHOLD = 0.12;

const SKIP_LINE_PATTERNS = [
  /^Fragenkatalog$/,
  /^Maschinisten Lehrgang$/,
  /^Maschinisten Lehrgang.*NABK$/,
  /^NABK(?:\b|\s|\|)/,
  /^NABK.*Maschinisten Lehrgang$/,
  /^Niedersächsische Akademie/,
  /^für Brand(?:\s|$)/,
  /^Stand:/,
  /^Hinweise:$/,
  /^Alle Rechte vorbehalten\.$/,
  /^Im Interesse der leichteren Lesbarkeit/,
  /^verzichtet\.$/,
  /^Nachdruck, auch auszugsweise/,
  /^Hinweis: Bei den einzelnen Fragen können mehrere Antworten als$/,
  /^richtig angekreuzt werden\.$/,
  /^-- \d+ of \d+ --$/,
];

function normalizeText(text) {
  return text
    .replace(/[\u2022]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+[a-j]\)$/i, '')
    .trim();
}

function appendWrappedText(current, addition) {
  if (!current) {
    return addition;
  }

  if (current.endsWith('-')) {
    return `${current.slice(0, -1)}${addition}`;
  }

  return `${current} ${addition}`;
}

function shouldSkipLine(text) {
  return SKIP_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

function groupTextLines(items) {
  const sorted = items
    .filter((item) => typeof item.str === 'string' && item.str.length > 0)
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width,
    }))
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > 0.8) {
        return b.y - a.y;
      }

      return a.x - b.x;
    });

  const lines = [];

  for (const item of sorted) {
    const currentLine = lines[lines.length - 1];

    if (currentLine && Math.abs(currentLine.y - item.y) < 0.8) {
      currentLine.items.push(item);
      continue;
    }

    lines.push({ y: item.y, items: [item] });
  }

  return lines
    .map((line) => {
      const itemsOnLine = line.items.sort((a, b) => a.x - b.x);
      const significantItems = itemsOnLine.filter((item) => item.str.trim());
      const text = normalizeText(itemsOnLine.map((item) => item.str).join(''));

      return {
        y: line.y,
        text,
        items: itemsOnLine,
        significantItems,
      };
    })
    .filter((line) => line.text);
}

function getOptionBounds(line) {
  const significant = line.significantItems;

  if (significant.length === 0) {
    return null;
  }

  const isBulletLine = significant[0].str.trim() === 'O';
  const relevantItems = isBulletLine ? significant.slice(1) : significant;

  if (relevantItems.length === 0) {
    return null;
  }

  return {
    x1: Math.floor(Math.min(...relevantItems.map((item) => item.x)) - 2),
    x2: Math.ceil(Math.max(...relevantItems.map((item) => item.x + item.w)) + 2),
  };
}

function getOptionSegments(line) {
  const segments = [];
  let currentSegment = null;

  for (const item of line.items) {
    if (!item.str.trim()) {
      if (currentSegment) {
        currentSegment.items.push(item);
      }
      continue;
    }

    if (item.str.trim() === 'O') {
      if (currentSegment && currentSegment.items.some((segmentItem) => segmentItem.str.trim())) {
        segments.push(currentSegment);
      }

      currentSegment = { items: [item] };
      continue;
    }

    if (!currentSegment) {
      return [];
    }

    currentSegment.items.push(item);
  }

  if (currentSegment && currentSegment.items.some((segmentItem) => segmentItem.str.trim())) {
    segments.push(currentSegment);
  }

  return segments.map((segment) => {
    const significantItems = segment.items.filter((item) => item.str.trim());
    const text = normalizeText(segment.items.map((item) => item.str).join('').replace(/^O\s*/, ''));
    const bounds = getOptionBounds({
      significantItems,
    });

    return {
      text,
      bounds,
    };
  });
}

function measureHighlightRatio(png, bounds, baselineY) {
  if (!bounds) {
    return 0;
  }

  const yCenter = Math.round(png.height - baselineY);
  const y1 = Math.max(0, yCenter - 12);
  const y2 = Math.min(png.height, yCenter + 4);
  const x1 = Math.max(0, bounds.x1);
  const x2 = Math.min(png.width, bounds.x2);

  let yellowPixels = 0;
  let totalPixels = 0;

  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const index = (png.width * y + x) * 4;
      const red = png.data[index];
      const green = png.data[index + 1];
      const blue = png.data[index + 2];

      totalPixels += 1;

      if (red > 150 && green > 150 && blue < 140 && Math.abs(red - green) < 40) {
        yellowPixels += 1;
      }
    }
  }

  return totalPixels === 0 ? 0 : yellowPixels / totalPixels;
}

function createQuestion(id, initialText, pageNumber) {
  return {
    id,
    page: pageNumber,
    question: initialText,
    options: [],
  };
}

function finalizeQuestion(question) {
  return {
    id: question.id,
    page: question.page,
    question: normalizeText(question.question),
    options: question.options.map((option) => ({
      text: normalizeText(option.text),
      correct: option.correct,
      score: Number(option.score.toFixed(3)),
    })),
  };
}

async function renderPageToPng(parser, pageNumber) {
  const screenshot = await parser.getScreenshot({
    partial: [pageNumber],
    imageDataUrl: false,
  });

  return PNG.sync.read(Buffer.from(screenshot.pages[0].data));
}

function pushLineIntoOption(option, line, highlightRatio) {
  const text = line.text.replace(/^O\s*/, '').trim();

  option.text = appendWrappedText(option.text, text);
  option.score = Math.max(option.score, highlightRatio);
  option.correct = option.score >= HIGHLIGHT_THRESHOLD;
}

function shouldMergeWithPreviousOption(option, nextText, highlightRatio) {
  if (!option || highlightRatio >= HIGHLIGHT_THRESHOLD) {
    return false;
  }

  return /\b(?:der|die|das|dem|den|des|ein|eine|einer|einem|einen|eines|und|oder|wenn|weil|dass|mit|bei|auf|in|an|vom|zum|zur|für|durch|über|unter|nach|vor)$/.test(
    option.text,
  ) && /^[A-ZÄÖÜ]/.test(nextText);
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF not found: ${PDF_PATH}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const parser = new PDFParse({ data: pdfBuffer });

  const questions = [];
  let currentQuestion = null;
  let currentOption = null;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const png = await renderPageToPng(parser, pageNumber);
    const lines = groupTextLines(textContent.items);

    for (const line of lines) {
      if (shouldSkipLine(line.text)) {
        continue;
      }

      const questionMatch = line.text.match(/^(\d+)\)\s*(.*)$/);
      const optionSegments = getOptionSegments(line);
      const isOptionLine = optionSegments.length > 0;

      if (questionMatch) {
        if (currentQuestion) {
          questions.push(finalizeQuestion(currentQuestion));
        }

        currentQuestion = createQuestion(Number(questionMatch[1]), questionMatch[2], pageNumber);
        currentOption = null;
        continue;
      }

      if (!currentQuestion) {
        continue;
      }

      if (isOptionLine) {
        for (const segment of optionSegments) {
          const highlightRatio = measureHighlightRatio(png, segment.bounds, line.y);

          if (shouldMergeWithPreviousOption(currentOption, segment.text, highlightRatio)) {
            currentOption.text = appendWrappedText(currentOption.text, segment.text);
            currentOption.score = Math.max(currentOption.score, highlightRatio);
            currentOption.correct = currentOption.score >= HIGHLIGHT_THRESHOLD;
            continue;
          }

          currentOption = {
            text: '',
            score: 0,
            correct: false,
          };

          pushLineIntoOption(currentOption, { text: segment.text }, highlightRatio);
          currentQuestion.options.push(currentOption);
        }
        continue;
      }

      if (currentQuestion.options.length === 0) {
        currentQuestion.question = appendWrappedText(currentQuestion.question, line.text);
        continue;
      }

      if (!currentOption) {
        throw new Error(`Missing option context near question ${currentQuestion.id}`);
      }

      const bounds = getOptionBounds(line);
      const highlightRatio = measureHighlightRatio(png, bounds, line.y);
      pushLineIntoOption(currentOption, line, highlightRatio);
    }
  }

  if (currentQuestion) {
    questions.push(finalizeQuestion(currentQuestion));
  }

  await parser.destroy();

  const normalizedQuestions = questions.map((question) => ({
    id: question.id,
    page: question.page,
    question: question.question,
    options: question.options.map((option) => option.text),
    correctAnswers: question.options
      .map((option, index) => (option.correct ? index : -1))
      .filter((index) => index >= 0),
  }));

  if (normalizedQuestions.length !== 105) {
    throw new Error(`Expected 105 questions, found ${normalizedQuestions.length}`);
  }

  const invalidQuestions = normalizedQuestions.filter(
    (question) => question.options.length < 2 || question.correctAnswers.length === 0,
  );

  if (invalidQuestions.length > 0) {
    throw new Error(
      `Detected invalid questions: ${invalidQuestions
        .map((question) => `${question.id} (options=${question.options.length}, correct=${question.correctAnswers.length})`)
        .join(', ')}`,
    );
  }

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(normalizedQuestions, null, 2)}\n`, 'utf8');
  fs.writeFileSync(JS_PATH, `window.QUESTION_BANK = ${JSON.stringify(normalizedQuestions, null, 2)};\n`, 'utf8');

  const answerStats = normalizedQuestions.reduce((accumulator, question) => {
    const count = question.correctAnswers.length;
    accumulator[count] = (accumulator[count] || 0) + 1;
    return accumulator;
  }, {});

  console.log(`Generated ${normalizedQuestions.length} questions.`);
  console.log(`Answer distribution: ${JSON.stringify(answerStats)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
