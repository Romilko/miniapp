// Страница обучения: карточки блока, кнопки «Учу»/«Знаю», раунды, тумблер «Вразброс».
// Весь прогресс — только в памяти этой страницы: любой уход или F5 сбрасывает его.

(function () {
    const params = new URLSearchParams(window.location.search);
    const blockNumber = Number(params.get('block'));

    const blockTitle = document.getElementById('block-title');
    const blockRange = document.getElementById('block-range');
    const progressFill = document.getElementById('progress-know');
    const progressLearnFill = document.getElementById('progress-learn');
    const progressLabel = document.getElementById('progress-label');
    const shuffleToggle = document.getElementById('shuffle-toggle');
    const card = document.getElementById('card');
    const cardWord = document.getElementById('card-word');
    const cardBackWord = document.getElementById('card-back-word');
    const cardTranslation = document.getElementById('card-translation');
    const roundLabel = document.getElementById('round-label');
    const learnButton = document.getElementById('btn-learn');
    const knowButton = document.getElementById('btn-know');
    const continueButton = document.getElementById('btn-continue');
    const restartButton = document.getElementById('btn-restart');
    const backToBlocksButton = document.getElementById('btn-back-to-blocks');
    const roundRemaining = document.getElementById('round-remaining');
    const finishStats = document.getElementById('finish-stats');
    const errorText = document.getElementById('error-text');

    const trainingView = document.getElementById('training-view');
    const roundEndView = document.getElementById('round-end-view');
    const finishView = document.getElementById('finish-view');
    const errorView = document.getElementById('error-view');

    let block = null;
    let queue = [];
    let position = 0;
    let known = new Set();
    let learning = new Set();
    let shuffle = false;
    let round = 1;

    function showView(view) {
        for (const candidate of [trainingView, roundEndView, finishView, errorView]) {
            candidate.hidden = candidate !== view;
        }
    }

    function showError(message) {
        errorText.textContent = message;
        showView(errorView);
    }

    function buildQueue() {
        queue = block.words
            .map((wordEntry, index) => index)
            .filter((index) => !known.has(index));
        if (shuffle) {
            shuffleArray(queue);
        } else {
            queue.sort((a, b) => a - b);
        }
    }

    function startRound() {
        buildQueue();
        position = 0;
        renderCard();
        renderProgress();
    }

    function renderCard() {
        const wordEntry = block.words[queue[position]];
        cardWord.textContent = wordEntry.word;
        cardBackWord.textContent = wordEntry.word;
        cardTranslation.textContent = wordEntry.translation;
        setFlipped(false);
        roundLabel.textContent = 'Раунд ' + round + ' · карточка ' + (position + 1) + ' из ' + queue.length;
    }

    function setFlipped(value) {
        card.classList.toggle('card--flipped', value);
    }

    function flipCard() {
        card.classList.toggle('card--flipped');
    }

    function renderProgress() {
        const total = block.words.length;
        progressLabel.textContent = 'Знаю ' + known.size + ' из ' + total +
            (learning.size > 0 ? ' · учу ' + learning.size : '');
        progressFill.style.width = total === 0 ? '0%' : (known.size / total * 100) + '%';
        progressLearnFill.style.width = total === 0 ? '0%' : (learning.size / total * 100) + '%';
    }

    function answer(isKnown) {
        if (isKnown) {
            known.add(queue[position]);
            learning.delete(queue[position]);
        } else {
            learning.add(queue[position]);
        }
        position += 1;
        renderProgress();
        if (position >= queue.length) {
            endRound();
        } else {
            renderCard();
        }
    }

    function endRound() {
        round += 1;
        if (known.size >= block.words.length) {
            finishStats.textContent =
                'Блок ' + block.number + ' — все ' + block.words.length + ' ' +
                wordsLabel(block.words.length) + ' отмечены как известные.';
            showView(finishView);
        } else {
            roundRemaining.textContent =
                'Знаю ' + known.size + ' из ' + block.words.length +
                (learning.size > 0 ? ' · учу ' + learning.size : '') + '. ' +
                'В следующем раунде ' + (block.words.length - known.size) + ' ' +
                wordsLabel(block.words.length - known.size) + '.';
            showView(roundEndView);
        }
    }

    // Тумблер пересобирает порядок ещё не показанных карточек текущего раунда.
    function reorderRemaining() {
        const shown = queue.slice(0, position);
        const remaining = queue.slice(position);
        if (shuffle) {
            shuffleArray(remaining);
        } else {
            remaining.sort((a, b) => a - b);
        }
        queue = shown.concat(remaining);
    }

    card.addEventListener('click', flipCard);
    learnButton.addEventListener('click', () => answer(false));
    knowButton.addEventListener('click', () => answer(true));
    continueButton.addEventListener('click', () => {
        startRound();
        showView(trainingView);
    });
    restartButton.addEventListener('click', () => {
        known.clear();
        learning.clear();
        round = 1;
        startRound();
        showView(trainingView);
    });
    backToBlocksButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    shuffleToggle.addEventListener('change', () => {
        shuffle = shuffleToggle.checked;
        reorderRemaining();
    });
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space') {
            return;
        }
        const target = event.target;
        if (target instanceof HTMLElement && ['BUTTON', 'INPUT', 'A'].includes(target.tagName)) {
            return;
        }
        event.preventDefault();
        flipCard();
    });

    (async function init() {
        if (!Number.isInteger(blockNumber) || blockNumber < 1) {
            showError('Некорректный номер блока: ' + params.get('block'));
            return;
        }
        try {
            const blocks = await loadBlocks();
            block = blocks.find((candidate) => candidate.number === blockNumber);
            if (!block) {
                showError('Блок ' + blockNumber + ' не найден.');
                return;
            }
        } catch (throwable) {
            showError('Не удалось загрузить слова: ' + throwable.message);
            return;
        }
        blockTitle.textContent = 'Блок ' + block.number;
        blockRange.textContent = 'слова ' + block.from + '–' + block.to;
        startRound();
        showView(trainingView);
    })();
})();
