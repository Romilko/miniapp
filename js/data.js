// Загрузка и разбор encards_5500_random_ru.md в массив блоков со словами.
// Формат файла: заголовки "## Блок N (слова X–Y)" и строки
// "M. **word** — перевод — английское мини-описание" (третье поле может отсутствовать).

const BLOCK_HEADER_PATTERN = /^## Блок (\d+) \(слова (\d+)\s*[–—-]\s*(\d+)\)$/;
const ENTRY_PATTERN = /^\d+\.\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+?)(?:\s+[—–-]\s+(.+))?$/;

async function loadBlocks() {
    const response = await fetch('encards_5500_random_ru.md?v=2');
    if (!response.ok) {
        throw new Error('HTTP ' + response.status);
    }
    return parseBlocks(await response.text());
}

function parseBlocks(markdownText) {
    const blocks = [];
    let currentBlock = null;
    for (const line of markdownText.split(/\r?\n/)) {
        const headerMatch = line.match(BLOCK_HEADER_PATTERN);
        if (headerMatch) {
            currentBlock = {
                number: Number(headerMatch[1]),
                from: Number(headerMatch[2]),
                to: Number(headerMatch[3]),
                words: []
            };
            blocks.push(currentBlock);
            continue;
        }
        const entryMatch = line.match(ENTRY_PATTERN);
        if (entryMatch && currentBlock) {
            currentBlock.words.push({
                word: entryMatch[1].trim(),
                translation: entryMatch[2].trim(),
                definition: entryMatch[3] ? entryMatch[3].trim() : ''
            });
        }
    }
    return blocks;
}

function wordsLabel(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return 'слово';
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 'слова';
    }
    return 'слов';
}

function shuffleArray(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
