// Страница обучения: карточки блока, кнопки «Учу»/«Знаю», раунды.
// Порядок карточек и лицевая сторона — тумблеры в меню-шестерёнке,
// переход назад (кнопка или свайп вправо) отменяет ответ по карточке,
// английское описание слова — окошко по клику на ⓘ в углу карточки.
// Весь прогресс — только в памяти этой страницы: любой уход или F5 сбрасывает его.

(function () {
    const params = new URLSearchParams(window.location.search);
    const blockNumber = Number(params.get('block'));

    const blockTitle = document.getElementById('block-title');
    const blockRange = document.getElementById('block-range');
    const progressTrack = document.getElementById('progress-track');
    const progressLabel = document.getElementById('progress-label');
    const modeMenu = document.getElementById('mode-menu');
    const modeMenuButton = document.getElementById('mode-menu-button');
    const modeMenuDropdown = document.getElementById('mode-menu-dropdown');
    const shuffleToggle = document.getElementById('shuffle-toggle');
    const shuffleLabel = document.getElementById('shuffle-label');
    const frontSideToggle = document.getElementById('front-side-toggle');
    const frontSideLabel = document.getElementById('front-side-label');
    const card = document.getElementById('card');
    const cardWord = document.getElementById('card-word');
    const cardBackWord = document.getElementById('card-back-word');
    const cardTranslation = document.getElementById('card-translation');
    const infoButton = document.getElementById('btn-info');
    const definitionPopup = document.getElementById('definition-popup');
    const prevButton = document.getElementById('btn-prev');
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
    let frontRussian = false;
    let round = 1;
    // Ответы раунда с данными для отмены: {wordIndex, isKnown, wasKnown, wasLearning}.
    let answers = [];

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
        answers = [];
        renderCard();
        renderProgress();
        updatePrevButton();
    }

    function renderCard() {
        const wordEntry = block.words[queue[position]];
        // Лицевая сторона зависит от режима: слово или перевод.
        const frontText = frontRussian ? wordEntry.translation : wordEntry.word;
        const backText = frontRussian ? wordEntry.word : wordEntry.translation;
        cardWord.textContent = frontText;
        cardBackWord.textContent = frontText;
        cardTranslation.textContent = backText;
        definitionPopup.textContent = wordEntry.definition;
        definitionPopup.hidden = true;
        infoButton.hidden = !wordEntry.definition;
        // Следующая карточка показывается сразу лицевой стороной — без анимации возврата.
        if (card.classList.contains('card--flipped')) {
            card.classList.add('card--no-transition');
            setFlipped(false);
            void card.offsetWidth;
            card.classList.remove('card--no-transition');
        }
    }

    function setFlipped(value) {
        card.classList.toggle('card--flipped', value);
    }

    function flipCard() {
        card.classList.toggle('card--flipped');
    }

    // Шкала прогресса: один сегмент на карточку раунда, окрашивается в порядке ответов.
    function renderProgress() {
        const total = block.words.length;
        progressLabel.textContent = 'Знаю ' + known.size + ' из ' + total +
            (learning.size > 0 ? ' · учу ' + learning.size : '');
        progressTrack.replaceChildren();
        const totalSegments = Math.max(queue.length, answers.length);
        for (let index = 0; index < totalSegments; index += 1) {
            const segment = document.createElement('div');
            segment.className = 'progress-segment';
            if (index < answers.length) {
                segment.classList.add(answers[index].isKnown ? 'progress-segment--know' : 'progress-segment--learn');
            }
            progressTrack.appendChild(segment);
        }
    }

    function answer(isKnown) {
        const wordIndex = queue[position];
        answers.push({
            wordIndex: wordIndex,
            isKnown: isKnown,
            wasKnown: known.has(wordIndex),
            wasLearning: learning.has(wordIndex)
        });
        if (isKnown) {
            known.add(wordIndex);
            learning.delete(wordIndex);
        } else {
            learning.add(wordIndex);
        }
        position += 1;
        renderProgress();
        if (position >= queue.length) {
            endRound();
        } else {
            renderCard();
        }
        updatePrevButton();
    }

    // Возврат к предыдущей карточке: её ответ отменяется, можно дойти до первой в раунде.
    function goBack() {
        if (position === 0) {
            return;
        }
        position -= 1;
        const lastAnswer = answers.pop();
        known.delete(lastAnswer.wordIndex);
        learning.delete(lastAnswer.wordIndex);
        if (lastAnswer.wasKnown) {
            known.add(lastAnswer.wordIndex);
        }
        if (lastAnswer.wasLearning) {
            learning.add(lastAnswer.wordIndex);
        }
        renderCard();
        renderProgress();
        updatePrevButton();
    }

    function updatePrevButton() {
        prevButton.disabled = position === 0;
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

    // Смена порядка пересобирает порядок ещё не показанных карточек текущего раунда;
    // текущая и уже пройденные (для кнопки «назад») остаются на своих местах.
    function reorderRemaining() {
        const passed = queue.slice(0, position + 1);
        const upcoming = queue.slice(position + 1);
        if (shuffle) {
            shuffleArray(upcoming);
        } else {
            upcoming.sort((a, b) => a - b);
        }
        queue = passed.concat(upcoming);
    }

    // ---------- Меню режимов ----------

    // Подпись у тумблера показывает текущее состояние, а не действие.
    function refreshModeLabels() {
        shuffleLabel.textContent = shuffle ? 'вразброс' : 'по порядку';
        frontSideLabel.textContent = frontRussian ? 'русская' : 'английская';
    }

    function closeModeMenu() {
        modeMenuDropdown.hidden = true;
        modeMenuButton.setAttribute('aria-expanded', 'false');
    }

    modeMenuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const opened = modeMenuDropdown.hidden;
        modeMenuDropdown.hidden = !opened;
        modeMenuButton.setAttribute('aria-expanded', String(opened));
    });
    document.addEventListener('click', (event) => {
        if (!modeMenuDropdown.hidden && !modeMenu.contains(event.target)) {
            closeModeMenu();
        }
        if (!definitionPopup.hidden &&
            !definitionPopup.contains(event.target) && !infoButton.contains(event.target)) {
            definitionPopup.hidden = true;
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (!modeMenuDropdown.hidden) {
                closeModeMenu();
            }
            if (!definitionPopup.hidden) {
                definitionPopup.hidden = true;
            }
        }
    });

    shuffleToggle.addEventListener('change', () => {
        shuffle = shuffleToggle.checked;
        reorderRemaining();
        refreshModeLabels();
    });
    frontSideToggle.addEventListener('change', () => {
        frontRussian = frontSideToggle.checked;
        renderCard();
        refreshModeLabels();
    });

    // ---------- Переход к предыдущей карточке ----------

    prevButton.addEventListener('click', goBack);

    // Окошко английского описания: открывается и закрывается кликом по ⓘ.
    infoButton.addEventListener('click', (event) => {
        event.stopPropagation();
        definitionPopup.hidden = !definitionPopup.hidden;
    });

    // Свайп вправо по карточке — назад; отличаем его от клика-переворота.
    let touchStartX = 0;
    let touchStartY = 0;
    let touchTracking = false;
    let swipeConsumedClick = false;

    card.addEventListener('touchstart', (event) => {
        swipeConsumedClick = false;
        if (event.touches.length !== 1) {
            touchTracking = false;
            return;
        }
        touchTracking = true;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
    }, { passive: true });
    card.addEventListener('touchend', (event) => {
        if (!touchTracking) {
            return;
        }
        touchTracking = false;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && position > 0) {
            swipeConsumedClick = true;
            goBack();
        }
    });

    card.addEventListener('click', () => {
        if (swipeConsumedClick) {
            swipeConsumedClick = false;
            return;
        }
        flipCard();
    });
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
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        const onControl = target instanceof HTMLElement && ['BUTTON', 'INPUT', 'A'].includes(target.tagName);
        if (event.code === 'Space') {
            if (onControl) {
                return;
            }
            event.preventDefault();
            flipCard();
        } else if (event.code === 'ArrowLeft' && !trainingView.hidden && !onControl) {
            goBack();
        }
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
