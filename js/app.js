// Одностраничное приложение: список блоков и обучение — на одной странице,
// без перезагрузок. Адрес отражает экран: «?block=N» — обучение блока N,
// без параметра — список блоков; «назад» браузера, жест от края экрана и кнопка
// выхода из обучения возвращают к списку по истории, не создавая новую запись. Порядок карточек и лицевая сторона — тумблеры в меню-
// шестерёнке, переход назад (кнопка или свайп вправо) отменяет ответ по карточке,
// английское описание слова — окошко по клику на ⓘ; кнопка ⓘ зафиксирована
// в углу сцены, как кнопка «назад», не вращается с карточкой и остаётся
// на месте при перевороте.
// Отметки блоков на главной («в процессе» — янтарная точка, «выучен» — зелёная
// галочка) хранятся в постоянных куках и удаляются только кнопкой в настройках;
// статус не понижается: не открывал → в процессе → выучен. Прогресс внутри блока —
// только в памяти текущего входа: выход к списку блоков или F5 сбрасывает его.

(function () {
    // ---------- Список блоков ----------

    const blocksView = document.getElementById('blocks-view');
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error-box');
    const blocksGrid = document.getElementById('blocks-grid');
    const settingsMenu = document.getElementById('settings-menu');
    const settingsMenuButton = document.getElementById('settings-menu-button');
    const settingsMenuDropdown = document.getElementById('settings-menu-dropdown');
    const clearProgressButton = document.getElementById('btn-clear-progress');

    // ---------- Обучение ----------

    const trainingShell = document.getElementById('training-shell');
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

    let blocks = null;
    let loadError = null;
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

    // ---------- Отрисовка списка блоков ----------

    function renderBlocksGrid() {
        const fragment = document.createDocumentFragment();
        for (const candidate of blocks) {
            const anchor = document.createElement('a');
            anchor.className = 'block-card';
            anchor.href = '?block=' + encodeURIComponent(candidate.number);

            const title = document.createElement('span');
            title.className = 'block-card__title';
            title.textContent = 'Блок ' + candidate.number;

            const range = document.createElement('span');
            range.className = 'block-card__range';
            range.textContent = 'слова ' + candidate.from + '–' + candidate.to;

            const count = document.createElement('span');
            count.className = 'block-card__count';
            count.textContent = candidate.words.length + ' ' + wordsLabel(candidate.words.length);

            const status = document.createElement('span');
            status.className = 'block-card__status';
            status.setAttribute('aria-hidden', 'true');

            anchor.append(title, range, count, status);
            fragment.appendChild(anchor);
            blockCards.set(candidate.number, anchor);
        }
        blocksGrid.appendChild(fragment);
    }

    // ---------- Отметки блоков в куках ----------

    // Самый минимум: только статус блока, без прогресса внутри блока.
    // Кука постоянная; удаляется только кнопкой «Очистить прогресс» в настройках.
    const PROGRESS_COOKIE = 'blocks-progress';
    const PROGRESS_COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60;
    const blockCards = new Map();
    const learnedBlocks = new Set();
    const doingBlocks = new Set();

    function saveProgressCookie() {
        const value = 'learned:' + [...learnedBlocks].join(',') + '|doing:' + [...doingBlocks].join(',');
        document.cookie = PROGRESS_COOKIE + '=' + value +
            '; max-age=' + PROGRESS_COOKIE_MAX_AGE + '; path=/; SameSite=Lax';
    }

    function loadProgressCookie() {
        for (const part of document.cookie.split(';')) {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1 || part.slice(0, separatorIndex).trim() !== PROGRESS_COOKIE) {
                continue;
            }
            for (const section of part.slice(separatorIndex + 1).split('|')) {
                const numbers = section.slice(section.indexOf(':') + 1)
                    .split(',')
                    .filter((candidate) => candidate !== '')
                    .map(Number)
                    .filter(Number.isInteger);
                if (section.startsWith('learned:')) {
                    numbers.forEach((number) => learnedBlocks.add(number));
                } else if (section.startsWith('doing:')) {
                    numbers.forEach((number) => doingBlocks.add(number));
                }
            }
        }
    }

    function refreshBlockCards() {
        for (const [number, blockCard] of blockCards) {
            blockCard.classList.toggle('block-card--learned', learnedBlocks.has(number));
            blockCard.classList.toggle('block-card--doing',
                !learnedBlocks.has(number) && doingBlocks.has(number));
        }
    }

    // Все слова блока отмечены «знаю» — блок выучен; любые ответы до этого —
    // «в процессе». Статус не понижается: повторный вход в выученный блок с
    // ошибками отметку не снимает.
    function updateBlockStatus() {
        if (block === null) {
            return;
        }
        if (known.size >= block.words.length) {
            learnedBlocks.add(block.number);
            doingBlocks.delete(block.number);
        } else if (!learnedBlocks.has(block.number)) {
            doingBlocks.add(block.number);
        }
        saveProgressCookie();
        refreshBlockCards();
    }

    function closeSettingsMenu() {
        settingsMenuDropdown.hidden = true;
        settingsMenuButton.setAttribute('aria-expanded', 'false');
    }

    settingsMenuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const opened = settingsMenuDropdown.hidden;
        settingsMenuDropdown.hidden = !opened;
        settingsMenuButton.setAttribute('aria-expanded', String(opened));
    });
    clearProgressButton.addEventListener('click', () => {
        if (!window.confirm('Удалить сохранённые отметки блоков?')) {
            return;
        }
        learnedBlocks.clear();
        doingBlocks.clear();
        document.cookie = PROGRESS_COOKIE + '=; max-age=0; path=/; SameSite=Lax';
        refreshBlockCards();
        closeSettingsMenu();
    });

    // ---------- Раунды и карточки ----------

    function showView(view) {
        for (const candidate of [trainingView, roundEndView, finishView, errorView]) {
            candidate.hidden = candidate !== view;
        }
    }

    function showError(message) {
        blocksView.hidden = true;
        trainingShell.hidden = false;
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
        updateBlockStatus();
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

    // ---------- Переключение экранов ----------

    function showBlocksView() {
        trainingShell.hidden = true;
        blocksView.hidden = false;
        document.title = '5500 английских слов — блоки';
    }

    // Каждый вход в блок начинается с чистого состояния и дефолтных режимов.
    function resetTrainingState() {
        known = new Set();
        learning = new Set();
        round = 1;
        shuffle = false;
        frontRussian = false;
        shuffleToggle.checked = false;
        frontSideToggle.checked = false;
        refreshModeLabels();
        closeModeMenu();
    }

    function openBlock(blockNumber) {
        if (loadError !== null) {
            showError('Не удалось загрузить слова: ' + loadError);
            return;
        }
        const foundBlock = blocks.find((candidate) => candidate.number === blockNumber);
        if (!foundBlock) {
            showError('Блок ' + blockNumber + ' не найден.');
            return;
        }
        block = foundBlock;
        blocksView.hidden = true;
        trainingShell.hidden = false;
        document.title = 'Блок ' + blockNumber + ' — обучение';
        blockTitle.textContent = 'Блок ' + block.number;
        blockRange.textContent = 'слова ' + block.from + '–' + block.to;
        resetTrainingState();
        startRound();
        showView(trainingView);
    }

    // ---------- Маршрутизация по адресу страницы ----------

    function renderFromLocation() {
        const rawBlock = new URLSearchParams(window.location.search).get('block');
        if (rawBlock === null) {
            showBlocksView();
            return;
        }
        const blockNumber = Number(rawBlock);
        if (!Number.isInteger(blockNumber) || blockNumber < 1) {
            showError('Некорректный номер блока: ' + rawBlock);
            return;
        }
        openBlock(blockNumber);
    }

    // Выход из обучения — буквальный «назад» по истории: запись «?block=N»
    // снимается, и «назад» браузера после выхода не возвращает в обучение.
    // При прямом входе по адресу (новая вкладка, перезагрузка) назад в приложение
    // идти некуда — тогда обычный внутренний переход к списку.
    let exitPending = false;
    function exitToBlocks() {
        if (history.state && history.state.app) {
            if (!exitPending) {
                exitPending = true;
                history.back();
            }
            return;
        }
        history.pushState({ app: true }, '', new URL('.', window.location.href));
        renderFromLocation();
    }

    // Внутренние ссылки (карточки блоков, «ко всем блокам») открываются без перезагрузки;
    // ссылки в новой вкладке работают как обычная загрузка приложения по адресу.
    // Ссылки выхода (data-back) идут literal назад по истории, а не новым переходом.
    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) {
            return;
        }
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!anchor) {
            return;
        }
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) {
            return;
        }
        event.preventDefault();
        if (anchor.hasAttribute('data-back')) {
            exitToBlocks();
            return;
        }
        history.pushState({ app: true }, '', url);
        renderFromLocation();
    });

    window.addEventListener('popstate', () => {
        exitPending = false;
        renderFromLocation();
    });

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
        if (!settingsMenuDropdown.hidden && !settingsMenu.contains(event.target)) {
            closeSettingsMenu();
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
            if (!settingsMenuDropdown.hidden) {
                closeSettingsMenu();
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
    backToBlocksButton.addEventListener('click', exitToBlocks);
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        const onControl = target instanceof HTMLElement && ['BUTTON', 'INPUT', 'A'].includes(target.tagName);
        if (event.code === 'Space' && !trainingView.hidden) {
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
        try {
            blocks = await loadBlocks();
        } catch (throwable) {
            loadError = throwable.message;
        }
        loading.hidden = true;
        if (loadError !== null) {
            errorBox.hidden = false;
            errorBox.textContent = 'Не удалось загрузить список блоков: ' + loadError;
        } else {
            loadProgressCookie();
            renderBlocksGrid();
            refreshBlockCards();
        }
        renderFromLocation();
    })();
})();
