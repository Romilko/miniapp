// Главная страница: список блоков из encards_5500_random_ru.md.

(async function () {
    const grid = document.getElementById('blocks-grid');
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error-box');

    try {
        const blocks = await loadBlocks();
        loading.hidden = true;
        const fragment = document.createDocumentFragment();
        for (const block of blocks) {
            const anchor = document.createElement('a');
            anchor.className = 'block-card';
            anchor.href = 'train.html?block=' + encodeURIComponent(block.number);

            const title = document.createElement('span');
            title.className = 'block-card__title';
            title.textContent = 'Блок ' + block.number;

            const range = document.createElement('span');
            range.className = 'block-card__range';
            range.textContent = 'слова ' + block.from + '–' + block.to;

            const count = document.createElement('span');
            count.className = 'block-card__count';
            count.textContent = block.words.length + ' ' + wordsLabel(block.words.length);

            anchor.append(title, range, count);
            fragment.appendChild(anchor);
        }
        grid.appendChild(fragment);
    } catch (throwable) {
        loading.hidden = true;
        errorBox.hidden = false;
        errorBox.textContent = 'Не удалось загрузить список блоков: ' + throwable.message;
    }
})();
