// Одностраничное приложение: список блоков и обучение — на одной странице,
// без перезагрузок. Адрес отражает экран: «?block=N» — обучение блока N,
// без параметра — список блоков; «назад» браузера, жест от края экрана и кнопка
// выхода из обучения возвращают к списку по истории, не создавая новую запись. Порядок карточек и лицевая сторона — тумблеры в меню-
// шестерёнке, переход назад (кнопка или свайп вправо) отменяет ответ по карточке,
// английское описание слова — окошко по клику на ⓘ; кнопка ⓘ зафиксирована
// в углу сцены, как кнопка «назад», не вращается с карточкой и остаётся
// на месте при перевороте.
// Прогресс блоков хранится в localStorage: по каждому блоку — какие слова
// выучены, какие «учу», очередь раунда и ответы (вход продолжается с того
// слова, на котором закончили, линия прогресса и отмены восстанавливаются)
// и настройки самого блока — порядок карточек и лицевая сторона. Полностью
// выученный блок открывается сразу на финальном экране. Статусы на главной
// («в процессе» — янтарная точка, «выучен» — зелёная галочка) выводятся из
// этого же хранилища; «Очистить прогресс» в настройках главной удаляет всё,
// «Начать заново» сбрасывает прогресс блока, сохраняя его настройки.

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
    const restartBlockButton = document.getElementById('btn-restart-block');

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
    // Настройки по умолчанию для блоков без сохранённых собственных:
    // наследуются из прежнего глобального формата хранилища, иначе — выключены.
    let initialShuffle = false;
    let initialFrontRussian = false;
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
            blockTotals.set(candidate.number, candidate.words.length);
        }
        blocksGrid.appendChild(fragment);
    }

    // ---------- Прогресс блоков и их настройки в localStorage ----------

    // По каждому блоку хранятся выученные слова, слова «учу», очередь раунда,
    // ответы раунда (линия прогресса и отмены) и настройки этого блока:
    // порядок карточек и лицевая сторона. Хранилище постоянное; «Очистить
    // прогресс» удаляет всё, «Начать заново» сбрасывает прогресс блока,
    // сохраняя его настройки.
    const PROGRESS_KEY = 'word-progress';
    const blockCards = new Map();
    const blockTotals = new Map();
    const blockProgress = new Map();

    function loadProgressStorage() {
        let raw = null;
        try {
            raw = localStorage.getItem(PROGRESS_KEY);
        } catch (throwable) {
            return;
        }
        if (raw === null) {
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (throwable) {
            return;
        }
        const settings = parsed.settings;
        if (settings !== null && typeof settings === 'object') {
            initialShuffle = settings.shuffle === true;
            initialFrontRussian = settings.frontRussian === true;
        }
        // Новый формат — {settings, blocks}; старый — {номер: [выученные индексы]}.
        const blocks = (parsed.blocks !== null && typeof parsed.blocks === 'object')
            ? parsed.blocks
            : parsed;
        for (const [key, value] of Object.entries(blocks)) {
            const number = Number(key);
            if (!Number.isInteger(number)) {
                continue;
            }
            if (Array.isArray(value)) {
                blockProgress.set(number, {
                    known: value.filter((index) => Number.isInteger(index)),
                    learning: [],
                    queue: [],
                    answers: []
                });
                continue;
            }
            if (value === null || typeof value !== 'object') {
                continue;
            }
            blockProgress.set(number, {
                known: Array.isArray(value.known)
                    ? value.known.filter((index) => Number.isInteger(index)) : [],
                learning: Array.isArray(value.learning)
                    ? value.learning.filter((index) => Number.isInteger(index)) : [],
                queue: Array.isArray(value.queue)
                    ? value.queue.filter((index) => Number.isInteger(index)) : [],
                answers: Array.isArray(value.answers) ? value.answers : [],
                shuffle: typeof value.shuffle === 'boolean' ? value.shuffle : undefined,
                frontRussian: typeof value.frontRussian === 'boolean' ? value.frontRussian : undefined
            });
        }
    }

    function saveProgressStorage() {
        const data = { blocks: {} };
        for (const [number, state] of blockProgress) {
            data.blocks[number] = state;
        }
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
        } catch (throwable) {
            // localStorage недоступен (приватный режим, квота) — обучение
            // продолжается без сохранения.
        }
    }

    function refreshBlockCards() {
        for (const [number, blockCard] of blockCards) {
            const state = blockProgress.get(number);
            const total = blockTotals.get(number);
            const knownCount = state === undefined ? 0 : state.known.length;
            const learned = total !== undefined && knownCount >= total;
            // «В процессе» — любой проходивший блок: в записи есть прогресс
            // (выученные, «учу» или очередь раунда), даже если выучено ноль;
            // запись только с настройками (после «Начать заново») не считается.
            const hasProgress = state !== undefined &&
                (state.known.length + state.learning.length + state.queue.length) > 0;
            blockCard.classList.toggle('block-card--learned', learned);
            blockCard.classList.toggle('block-card--doing', hasProgress && !learned);
        }
    }

    // Снимок состояния блока: очередь раунда как есть и ответы раунда — по ним
    // восстанавливаются линия прогресса, отмены и текущая карточка (позиция
    // раунда не хранится: она равна числу ответов).
    function snapshotBlockState() {
        return {
            known: [...known],
            learning: [...learning],
            queue: [...queue],
            answers: [...answers],
            shuffle: shuffle,
            frontRussian: frontRussian
        };
    }

    // Ответ, отмена ответа и смена настроек сохраняют состояние блока и настройки.
    function updateBlockStatus() {
        if (block !== null) {
            blockProgress.set(block.number, snapshotBlockState());
            refreshBlockCards();
        }
        saveProgressStorage();
    }

    // «Начать заново»: сбрасывает и сохранённый в localStorage прогресс блока,
    // и текущую сессию — блок снова идёт с первого слова.
    function restartBlock() {
        confirmAction(
            'Начать заново',
            'Сбросить сохранённый прогресс блока ' + block.number + ' и начать его с первого слова?',
            'Начать заново'
        ).then((confirmed) => {
            if (!confirmed) {
                return;
            }
            // Настройки блока переживают перезапуск: прогресс сбрасывается,
            // а настройки остаются в пустой записи блока.
            blockProgress.set(block.number, {
                known: [],
                learning: [],
                queue: [],
                answers: [],
                shuffle: shuffle,
                frontRussian: frontRussian
            });
            saveProgressStorage();
            known = new Set();
            learning = new Set();
            round = 1;
            startRound();
            showView(trainingView);
            closeModeMenu();
            refreshBlockCards();
        });
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
        confirmAction(
            'Очистить прогресс',
            'Удалить весь сохранённый прогресс по всем блокам?',
            'Очистить'
        ).then((confirmed) => {
            if (!confirmed) {
                return;
            }
            blockProgress.clear();
            initialShuffle = false;
            initialFrontRussian = false;
            try {
                localStorage.removeItem(PROGRESS_KEY);
            } catch (throwable) {
                // Недоступный localStorage не должен ломать очистку.
            }
            refreshBlockCards();
            closeSettingsMenu();
        });
    });

    // ---------- Диалог подтверждения ----------

    // Кастомная замена window.confirm в стиле приложения: обещает true при
    // подтверждении и false при отмене (кнопка, Escape, клик по затемнению).
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-modal-title');
    const confirmText = document.getElementById('confirm-modal-text');
    const confirmOkButton = document.getElementById('confirm-modal-ok');
    const confirmCancelButton = document.getElementById('confirm-modal-cancel');
    let confirmResolver = null;

    function confirmAction(title, text, okLabel) {
        return new Promise((resolve) => {
            confirmResolver = resolve;
            confirmTitle.textContent = title;
            confirmText.textContent = text;
            confirmOkButton.textContent = okLabel;
            confirmModal.hidden = false;
            confirmCancelButton.focus();
        });
    }

    function settleConfirm(confirmed) {
        if (confirmResolver === null) {
            return;
        }
        const resolve = confirmResolver;
        confirmResolver = null;
        confirmModal.hidden = true;
        // Диалог закрывает и меню, из которого вызван, — одинаково для
        // подтверждения, «Отмены», Escape и клика по затемнению.
        closeModeMenu();
        closeSettingsMenu();
        resolve(confirmed);
    }

    confirmOkButton.addEventListener('click', () => settleConfirm(true));
    confirmCancelButton.addEventListener('click', () => settleConfirm(false));
    confirmModal.addEventListener('click', (event) => {
        if (event.target === confirmModal) {
            settleConfirm(false);
        }
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
        const result = block.words
            .map((wordEntry, index) => index)
            .filter((index) => !known.has(index));
        if (shuffle) {
            shuffleArray(result);
        } else {
            result.sort((a, b) => a - b);
        }
        return result;
    }

    // Восстановление раунда из записи блока: сохранённые очередь и ответы
    // продолжают раунд с того же слова и с той же линией прогресса. Раунд
    // без сохранённой очереди или полностью отвеченный не продолжается.
    function buildRestoredRound(saved) {
        if (saved === undefined || !Array.isArray(saved.queue) || saved.queue.length === 0) {
            return undefined;
        }
        const restoredAnswers = [];
        if (Array.isArray(saved.answers)) {
            for (const entry of saved.answers) {
                if (entry === null || typeof entry !== 'object' ||
                    !Number.isInteger(entry.wordIndex) || typeof entry.isKnown !== 'boolean') {
                    break;
                }
                restoredAnswers.push(entry);
            }
        }
        if (restoredAnswers.length >= saved.queue.length) {
            return undefined;
        }
        return { queue: saved.queue, answers: restoredAnswers };
    }

    // restoredRound — сохранённые очередь и ответы: линия прогресса, отмены
    // и текущая карточка продолжаются с того же места; без него раунд новый.
    function startRound(restoredRound) {
        if (restoredRound !== undefined) {
            queue = restoredRound.queue;
            answers = restoredRound.answers;
        } else {
            queue = buildQueue();
            answers = [];
        }
        position = answers.length;
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
        updateBlockStatus();
        renderCard();
        renderProgress();
        updatePrevButton();
    }

    function updatePrevButton() {
        prevButton.disabled = position === 0;
    }

    function showFinishView() {
        finishStats.textContent =
            'Блок ' + block.number + ' — все ' + block.words.length + ' ' +
            wordsLabel(block.words.length) + ' отмечены как известные.';
        showView(finishView);
    }

    function endRound() {
        round += 1;
        if (known.size >= block.words.length) {
            showFinishView();
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

    // Вход в блок восстанавливает сохранённый прогресс: выученные слова, слова
    // «учу», настройки блока и раунд — очередь, ответы (линия прогресса) и
    // текущая карточка; у блока без записи — настройки по умолчанию и новый раунд.
    function resetTrainingState() {
        const saved = blockProgress.get(block.number);
        known = new Set(saved === undefined ? [] : saved.known);
        learning = new Set(saved === undefined ? [] : saved.learning);
        shuffle = saved !== undefined && typeof saved.shuffle === 'boolean'
            ? saved.shuffle : initialShuffle;
        frontRussian = saved !== undefined && typeof saved.frontRussian === 'boolean'
            ? saved.frontRussian : initialFrontRussian;
        shuffleToggle.checked = shuffle;
        frontSideToggle.checked = frontRussian;
        refreshModeLabels();
        round = 1;
        closeModeMenu();
        return saved;
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
        const saved = resetTrainingState();
        if (known.size >= block.words.length) {
            // Полностью выученный блок открывается сразу на финальный экран.
            showFinishView();
        } else {
            startRound(buildRestoredRound(saved));
            showView(trainingView);
        }
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
            if (!confirmModal.hidden) {
                settleConfirm(false);
                return;
            }
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
        updateBlockStatus();
    });
    frontSideToggle.addEventListener('change', () => {
        frontRussian = frontSideToggle.checked;
        renderCard();
        refreshModeLabels();
        updateBlockStatus();
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
    restartButton.addEventListener('click', restartBlock);
    restartBlockButton.addEventListener('click', restartBlock);
    backToBlocksButton.addEventListener('click', exitToBlocks);
    document.addEventListener('keydown', (event) => {
        // Пока открыт диалог подтверждения, карточки сзади не реагируют.
        if (!confirmModal.hidden) {
            return;
        }
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

    // Пустой обработчик: на iOS Safari без слушателя touchstart у предка
    // не срабатывает :active — кнопки не дают отклика при нажатии пальцем.
    document.body.addEventListener('touchstart', () => {}, { passive: true });

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
            loadProgressStorage();
            renderBlocksGrid();
            refreshBlockCards();
        }
        renderFromLocation();
    })();
})();
