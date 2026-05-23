/* ==========================================================================
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ
   ========================================================================== */
let mainBgImage = ''; // Главная фоновая картинка
let mainScrollPosition = 0; // Сохраненная позиция скролла

// Переменные для бесконечного скролла главной страницы
let mainCurrentPage = 1;
let mainCurrentType = 'new';
let isFetchingMain = false;
let noMoreMain = false;
let currentMainFetchId = 0; // Для предотвращения наложения запросов при быстром клике
let loadedMainAnimeIds = new Set(); // Хранилище загруженных ID для защиты от дубликатов

// Переменные для аудиоплеера
let currentAudio = null;
let currentPlayingCard = null;

// Переменные для галереи
let currentMediaIndex = 0;
let galleryMedia = [];
let isAnimating = false;
let fanartDisclaimerAccepted = false; // Состояние согласия с дисклеймером 18+
let onDisclaimerAccepted = null; // Коллбек для продолжения после согласия

// Переменные для бесконечного скролла фан-артов
let fanartSearchQuery = '';
let fanartCurrentPage = 1;
let isFetchingFanarts = false;
let noMoreFanarts = false;
let globalFanartsMedia = [];

/* ==========================================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
   fetchNewAnime();
    loadAnimeList('new', true); // Загружаем новинки по умолчанию
    setupGalleryListeners(); // Настраиваем модалку галереи 1 раз при загрузке
    setupMusicModalListeners(); // Настраиваем модалку плеера
    setupCategoryButtons(); // Настраиваем переключение вкладок
    setupAgeModalListeners(); // Настраиваем кнопки окна 18+
    setupFanartGridListeners(); // Настраиваем окно сетки фан-артов
});

/* ==========================================================================
   ЛОГИКА ГЛАВНОГО ЭКРАНА
   ========================================================================== */
async function fetchNewAnime() {
    try {
        const response = await fetch('https://api.jikan.moe/v4/seasons/now?limit=1&sfw=true');
        const result = await response.json();
        const container = document.getElementById('anime-covers');

        if (result.data.length > 0) {
            const anime = result.data[0];
            const img = document.createElement('img');
            
            // Базовая картинка на случай, если не найдем вариант лучше
            let bestImage = anime.trailer?.images?.maximum_image_url || anime.images.jpg.large_image_url;

            // Пытаемся найти качественный широкий фон (Backdrop) через TMDB
            try {
                const TMDB_API_KEY = 'e430e21ae635845f8fc4d7786252a13b';
                const tmdbSearch = await fetchTimeout(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(anime.title)}`, 3000);
                if (tmdbSearch.ok) {
                    const searchResult = await tmdbSearch.json();
                    if (searchResult.results && searchResult.results.length > 0) {
                        const tmdbItem = searchResult.results[0];
                        const mediaType = tmdbItem.media_type || 'tv';
                        const detailsRes = await fetchTimeout(`https://api.themoviedb.org/3/${mediaType}/${tmdbItem.id}?api_key=${TMDB_API_KEY}&append_to_response=images`, 3000);
                        
                        if (detailsRes.ok) {
                            const detailsData = await detailsRes.json();
                            if (detailsData.images && detailsData.images.backdrops && detailsData.images.backdrops.length > 0) {
                                // Берем HD-версию самого популярного фона для этого аниме
                                bestImage = `https://image.tmdb.org/t/p/original${detailsData.images.backdrops[0].file_path}`;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('Не удалось загрузить фон с TMDB, используем стандартный');
            }

            img.src = bestImage;
            img.alt = anime.title;
            img.title = anime.title;
            
            img.style.cursor = 'pointer';
            img.onclick = () => showAnimeDetails(anime.mal_id); // Открываем детали
            
            mainBgImage = `url('${img.src}')`;
            document.documentElement.style.setProperty('--bg-image', mainBgImage);
            
            container.appendChild(img);
        }
    } catch (error) {
        console.error('Ошибка при получении данных об аниме:', error);
    }
}

async function loadAnimeList(type, reset = true) {
    if (isFetchingMain && !reset) return; // Защита от спама при скролле
    if (noMoreMain && !reset) return; // Если элементов больше нет

    const fetchId = ++currentMainFetchId; // Уникальный ID запроса
    isFetchingMain = true;

    if (reset) {
        mainCurrentPage = 1;
        mainCurrentType = type;
        noMoreMain = false;
        loadedMainAnimeIds.clear(); // Очищаем память от старых ID при переключении вкладок
    }

    const container = document.getElementById('bottom-anime-list');
    if (reset) {
        container.style.opacity = '0.5'; // Слегка затемняем старый список
        container.style.pointerEvents = 'none';
    }
    
    let url = '';
    if (type === 'new') url = `https://api.jikan.moe/v4/seasons/now?page=${mainCurrentPage}&limit=24&sfw=true`;
    else if (type === 'popular') url = `https://api.jikan.moe/v4/top/anime?filter=bypopularity&page=${mainCurrentPage}&limit=24&sfw=true`;
    else if (type === 'recommend') url = `https://api.jikan.moe/v4/top/anime?page=${mainCurrentPage}&limit=24&sfw=true`;

    try {
        const response = await fetch(url);
        const result = await response.json();

        if (fetchId !== currentMainFetchId) return; // Прерываем, если пользователь быстро переключил вкладку

        if (reset) container.innerHTML = '';

        let listData = result.data || [];
        if (listData.length === 0) {
            noMoreMain = true;
        } else {
            // Отрезаем первое аниме только на первой странице вкладки "Новинки" (оно на фоне)
            if (type === 'new' && mainCurrentPage === 1) listData = listData.slice(1);

            listData.forEach(anime => {
                // Если это аниме уже загружалось на экран — пропускаем его
                if (loadedMainAnimeIds.has(anime.mal_id)) return;
                loadedMainAnimeIds.add(anime.mal_id); // Запоминаем новое аниме

                const img = document.createElement('img');
                img.src = anime.images.jpg.large_image_url || anime.images.jpg.image_url;
                img.title = anime.title;
                img.className = 'mini-cover';
                img.loading = 'lazy'; // Ленивая загрузка для обложек
                
                img.onclick = () => showAnimeDetails(anime.mal_id); // Открываем детали
                
                container.appendChild(img);
            });
            mainCurrentPage++; // Увеличиваем страницу для следующего скролла
        }
    } catch (error) {
        console.error('Ошибка при получении списка:', error);
    } finally {
        if (reset) {
            container.style.opacity = '1';
            container.style.pointerEvents = 'auto';
        }
        isFetchingMain = false;
    }
}

function setupCategoryButtons() {
    const buttons = document.querySelectorAll('#action-buttons .btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Убираем класс active у всех кнопок и добавляем нажатой
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Загружаем соответствующий список
            const text = e.target.textContent;
            if (text === 'Новинки') loadAnimeList('new', true);
            else if (text === 'Популярное') loadAnimeList('popular', true);
            else if (text === 'Рекомендации') loadAnimeList('recommend', true);
        });
    });

    // Глобальный слушатель скролла для подгрузки новых элементов на главной
    window.addEventListener('scroll', () => {
        // Проверяем, что мы находимся на главном экране (он не скрыт)
        if (!document.getElementById('main-view').classList.contains('hidden')) {
            // Подгружаем, если до конца экрана осталось менее 500px
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                loadAnimeList(mainCurrentType, false);
            }
        }
    });
}

/* ==========================================================================
   ЛОГИКА ЭКРАНА ИНФОРМАЦИИ (SPA НАВИГАЦИЯ)
   ========================================================================== */
async function showAnimeDetails(animeId, isRelatedSwitch = false) {
    const container = document.getElementById('anime-detail');

    if (!isRelatedSwitch) {
        // Запоминаем скролл ТОЛЬКО если переходим с главного экрана
        if (!document.getElementById('main-view').classList.contains('hidden')) {
            mainScrollPosition = window.scrollY;
        }
        document.getElementById('main-view').classList.add('hidden');
        document.getElementById('details-view').classList.remove('hidden');
        window.scrollTo(0, 0); // При открытии нового аниме кидаем в самый верх
    } else {
        // Фиксируем высоту, чтобы страница резко не сжималась при появлении надписи "Загрузка..."
        container.style.minHeight = `${container.offsetHeight}px`;
    }

    container.innerHTML = '<h2 id="loading-text" style="color: white; text-align: center; margin-top: 50px;">Загрузка...</h2>';
    galleryMedia = []; // Очищаем галерею для нового аниме
    currentMediaIndex = 0;

    try {
        const response = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
        const result = await response.json();
        const anime = result.data;
        if (!anime) throw new Error("Данные не найдены");

        // Обложка
        const img = document.createElement('img');
        img.src = anime.images.jpg.large_image_url;
        img.className = 'anime-page-cover';
        img.alt = anime.title;

        // Заголовок
        const titleElement = document.createElement('h1');
        titleElement.textContent = anime.title;
        titleElement.className = 'anime-page-title';

        // Описание
        const synopsisElement = document.createElement('p');
        synopsisElement.className = 'anime-synopsis';
        synopsisElement.textContent = anime.synopsis ? anime.synopsis : "Описание отсутствует.";

        // Контейнер скриншотов
        const screenshotsContainer = document.createElement('div');
        screenshotsContainer.className = 'anime-screenshots-container';
        
        let screenshots = [];
        let tmdbTrailerId = null; 
        let tmdbSeasonsCount = null; // Переменная для сезонов из TMDB
        let tmdbSeasonsData = {}; // Данные о количестве серий по сезонам

        // Запрос к TMDB
        const TMDB_API_KEY = 'e430e21ae635845f8fc4d7786252a13b'; 

        const tmdbPromise = fetchTimeout(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(anime.title)}`, 3000)
            .then(res => res.ok ? res.json() : { results: [] })
            .then(async searchResult => {
                if (searchResult.results && searchResult.results.length > 0) {
                    const tmdbItem = searchResult.results[0]; 
                    const mediaType = tmdbItem.media_type || 'tv'; 
                    
                    const detailsRes = await fetchTimeout(`https://api.themoviedb.org/3/${mediaType}/${tmdbItem.id}?api_key=${TMDB_API_KEY}&append_to_response=images,videos`, 3000);
                    if (detailsRes.ok) {
                        const detailsData = await detailsRes.json();
                        
                        if (detailsData.images && detailsData.images.backdrops) {
                            detailsData.images.backdrops.slice(0, 15).forEach(bg => {
                                screenshots.push(`https://image.tmdb.org/t/p/w1280${bg.file_path}`); // Улучшаем качество скриншотов до HD
                            });
                        }

                        if (detailsData.videos && detailsData.videos.results) {
                            const trailer = detailsData.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                            if (trailer) tmdbTrailerId = trailer.key;
                        }

                        // Извлекаем общее количество сезонов
                        if (detailsData.number_of_seasons) {
                            tmdbSeasonsCount = detailsData.number_of_seasons;
                        }

                        // Извлекаем количество серий для каждого сезона
                        if (detailsData.seasons) {
                            detailsData.seasons.forEach(s => {
                                if (s.season_number > 0) {
                                    tmdbSeasonsData[s.season_number] = s.episode_count;
                                }
                            });
                        }
                    }
                }
            })
            .catch(() => console.warn('TMDB недоступен'));
            
        // Запрос к Jikan API за списком персонажей
        const charactersPromise = fetchTimeout(`https://api.jikan.moe/v4/anime/${animeId}/characters`, 3000)
            .then(res => res.ok ? res.json() : { data: [] })
            .catch(() => ({ data: [] }));

        // Запрос к Jikan API за музыкой (themes) - иногда в основном запросе их нет
        const themesPromise = fetchTimeout(`https://api.jikan.moe/v4/anime/${animeId}/themes`, 3000)
            .then(res => res.ok ? res.json() : { data: { openings: [], endings: [] } })
            .catch(() => ({ data: { openings: [], endings: [] } }));

        // Ждем выполнения всех дополнительных запросов
        const [_, charsResult, themesResult] = await Promise.all([tmdbPromise, charactersPromise, themesPromise]);

        // Мета-информация (собираем ПОСЛЕ ответа от TMDB)
        const metaElement = document.createElement('div');
        metaElement.className = 'anime-meta';
        const releaseDate = anime.year || (anime.aired && anime.aired.string ? anime.aired.string.split(' to')[0] : 'Неизвестно');
        const genres = anime.genres && anime.genres.length > 0 ? anime.genres.map(g => g.name).join(', ') : 'Нет данных';
        const ageRating = anime.rating ? anime.rating.split(' - ')[0] : 'NR';
        const score = anime.score ? anime.score : 'N/A';
        const seasons = tmdbSeasonsCount || 1; // Если TMDB недоступен или это фильм, пишем 1 сезон
        
        // Динамический Apple-эмодзи в зависимости от оценки
        let emojiUrl = 'https://em-content.zobj.net/source/apple/391/neutral-face_1f610.png'; // По умолчанию (если оценки нет)
        let emojiAlt = '😐';
        
        if (anime.score) {
            if (anime.score < 3) {
                emojiUrl = 'https://em-content.zobj.net/source/apple/391/worried-face_1f61f.png';
                emojiAlt = '😟';
            } else if (anime.score < 6) {
                emojiUrl = 'https://em-content.zobj.net/source/apple/391/smiling-face-with-smiling-eyes_1f60a.png';
                emojiAlt = '😊';
            } else if (anime.score < 8) {
                emojiUrl = 'https://em-content.zobj.net/source/apple/391/grinning-face-with-smiling-eyes_1f604.png';
                emojiAlt = '😄';
            } else {
                emojiUrl = 'https://em-content.zobj.net/source/apple/391/star-struck_1f929.png';
                emojiAlt = '🤩';
            }
        }

        metaElement.innerHTML = `
            <div class="meta-left">
                <div class="meta-rating">${ageRating}</div>
                <div class="meta-text">
                    <span class="meta-release">Release: ${releaseDate}</span>
                    <span class="meta-genres">${genres}</span>
                </div>
            </div>
            <div class="meta-stats">
                <img class="meta-emoji" src="${emojiUrl}" alt="${emojiAlt}">
                <div class="meta-stats-text">
                    <span class="meta-score">★ ${score}</span>
                    <span class="meta-episodes">Seasons: ${seasons}</span>
                </div>
            </div>
        `;
        
        let loadedScreenshots = [...new Set(screenshots)];
        let isDown = false, startX, scrollLeft, isDragging = false; 
        const youtubeId = (anime.trailer && anime.trailer.youtube_id) ? anime.trailer.youtube_id : tmdbTrailerId;

        // Отдельный массив для основной галереи (скриншоты + трейлер)
        let mainMedia = [];

        // Создание элемента Трейлера
        if (youtubeId) {
            mainMedia.push({ type: 'video', src: youtubeId }); 
            const trailerContainer = document.createElement('div');
            trailerContainer.className = 'anime-trailer-container';
            
            const trailerImg = document.createElement('img');
            if (anime.trailer && anime.trailer.youtube_id && anime.trailer.images && anime.trailer.images.maximum_image_url) {
                trailerImg.src = anime.trailer.images.maximum_image_url;
            } else {
                trailerImg.src = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            }
            
            const playBtn = document.createElement('div');
            playBtn.className = 'trailer-play-btn';
            playBtn.innerHTML = '&#9658;'; 
            
            trailerContainer.appendChild(trailerImg);
            trailerContainer.appendChild(playBtn);
            
            trailerContainer.onclick = () => { 
                if (!isDragging) {
                    galleryMedia = mainMedia; // Передаем основной медиа-массив в галерею
                    openModal(0); 
                }
            };
            screenshotsContainer.appendChild(trailerContainer);
        }

        // Создание элементов картинок
        if (loadedScreenshots.length > 0) {
            loadedScreenshots.forEach((src, index) => {
                mainMedia.push({ type: 'image', src: src }); 
                const picImg = document.createElement('img');
                picImg.src = src;
                picImg.className = 'anime-screenshot';
                picImg.loading = 'lazy'; // Ленивая загрузка скриншотов
                picImg.style.cursor = 'pointer';
                picImg.onclick = () => {
                    if (!isDragging) {
                        galleryMedia = mainMedia; // Передаем основной медиа-массив в галерею
                        openModal(youtubeId ? index + 1 : index);
                    }
                };
                screenshotsContainer.appendChild(picImg);
            });
        }

        // Логика drag-to-scroll для скриншотов
        screenshotsContainer.addEventListener('mousedown', (e) => {
            isDown = true; isDragging = false;
            screenshotsContainer.classList.add('is-dragging'); 
            startX = e.pageX - screenshotsContainer.offsetLeft;
            scrollLeft = screenshotsContainer.scrollLeft;
            e.preventDefault(); 
        });
        screenshotsContainer.addEventListener('mouseleave', () => { isDown = false; screenshotsContainer.classList.remove('is-dragging'); });
        screenshotsContainer.addEventListener('mouseup', () => { isDown = false; screenshotsContainer.classList.remove('is-dragging'); });
        screenshotsContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return; e.preventDefault();
            const walk = e.pageX - screenshotsContainer.offsetLeft - startX; 
            if (Math.abs(walk) > 5) isDragging = true; 
            screenshotsContainer.scrollLeft = scrollLeft - walk;
        });

        // Создаем блок персонажей
        const charactersWrapper = document.createElement('div');
        charactersWrapper.style.width = '100vw'; 
        if (charsResult.data && charsResult.data.length > 0) {
            const topCharacters = charsResult.data.slice(0, 15); // Берем топ-15 персонажей
            
            charactersWrapper.innerHTML = `
                <h3 class="section-title">Characters</h3>
                <div class="anime-characters-container">
                    ${topCharacters.map(c => `
                        <div class="character-card">
                            <img src="${c.character.images.jpg.image_url}" alt="${c.character.name}" class="character-img" loading="lazy">
                            <span class="character-name">${c.character.name.split(',').reverse().join(' ').trim()}</span>
                            <span class="character-role">${c.role}</span>
                        </div>
                    `).join('')}
                </div>
            `;

            // Добавляем drag-to-scroll и для ленты персонажей
            const charContainer = charactersWrapper.querySelector('.anime-characters-container');
            let isCharDown = false, charStartX, charScrollLeft;
            charContainer.addEventListener('mousedown', (e) => {
                isCharDown = true; charContainer.classList.add('is-dragging');
                charStartX = e.pageX - charContainer.offsetLeft; charScrollLeft = charContainer.scrollLeft;
                e.preventDefault();
            });
            charContainer.addEventListener('mouseleave', () => { isCharDown = false; charContainer.classList.remove('is-dragging'); });
            charContainer.addEventListener('mouseup', () => { isCharDown = false; charContainer.classList.remove('is-dragging'); });
            charContainer.addEventListener('mousemove', (e) => {
                if (!isCharDown) return; e.preventDefault();
                charContainer.scrollLeft = charScrollLeft - (e.pageX - charContainer.offsetLeft - charStartX);
            });
        }

        // Создаем блок с музыкой (поиск обложек через iTunes API и перенаправление на Apple Music)
        const themesWrapper = document.createElement('div');
        themesWrapper.style.width = '100vw';
        
        // Используем данные из отдельного запроса, если они есть, иначе пробуем достать из основного
        const animeThemes = (themesResult.data && (themesResult.data.openings?.length > 0 || themesResult.data.endings?.length > 0)) 
            ? themesResult.data 
            : anime.theme;

        if (animeThemes && (animeThemes.openings?.length > 0 || animeThemes.endings?.length > 0)) {
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.textContent = 'Music';
            themesWrapper.appendChild(title);
            
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'anime-themes-container';
            
            const allThemes = [];
            if (animeThemes.openings) animeThemes.openings.slice(0, 5).forEach(t => allThemes.push({ type: 'OP', raw: t }));
            if (animeThemes.endings) animeThemes.endings.slice(0, 5).forEach(t => allThemes.push({ type: 'ED', raw: t }));
            
            allThemes.forEach((theme, index) => {
                let titleText = "Unknown", artistText = "";
                const titleMatch = theme.raw.match(/"([^"]+)"/);
                if (titleMatch) titleText = titleMatch[1];
                const artistMatch = theme.raw.match(/by\s+([^(\[]+)/);
                if (artistMatch) artistText = artistMatch[1].trim();
                if (titleText === "Unknown") titleText = theme.raw.replace(/^[0-9]+:\s*/, '').split('(eps')[0].trim();

                let cleanTitle = titleText.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
                let cleanArtist = artistText.replace(/\(CV:.*?\)/gi, '').replace(/feat\..*/gi, '').trim();

                const fallbackCover = (loadedScreenshots.length > 0) ? loadedScreenshots[index % loadedScreenshots.length] : anime.images.jpg.image_url;
                const card = document.createElement('a'); 
                card.className = 'theme-card';
                card.href = 'javascript:void(0)'; 

                card.innerHTML = `
                    <div class="theme-cover-wrapper">
                        <img class="theme-cover" src="${fallbackCover}" alt="Cover" loading="lazy">
                        <div class="theme-type-badge">${theme.type}</div>
                    </div>
                    <span class="theme-title">${titleText}</span>
                    <span class="theme-artist">${artistText}</span>
                `;
                scrollContainer.appendChild(card);

                if (titleText !== "Unknown") {
                    let queryExact = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());
                    let queryTitle = encodeURIComponent(cleanTitle);

                    // Каскадный поиск в iTunes (США (Английский) -> Япония -> Только по названию)
                    fetch(`https://itunes.apple.com/search?term=${queryExact}&media=music&country=us&limit=1`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.results && data.results.length > 0) return data.results[0];
                            return fetch(`https://itunes.apple.com/search?term=${queryExact}&media=music&country=jp&limit=1`)
                                .then(r => r.json())
                                .then(d => d.results && d.results.length > 0 ? d.results[0] : null);
                        })
                        .then(track => {
                            if (!track) {
                                return fetch(`https://itunes.apple.com/search?term=${queryTitle}&media=music&country=jp&limit=1`)
                                    .then(r => r.json())
                                    .then(d => d.results && d.results.length > 0 ? d.results[0] : null);
                            }
                            return track;
                        })
                        .then(track => {
                            if (track && track.artworkUrl100) {
                                const highResCover = track.artworkUrl100.replace('100x100bb', '300x300bb');
                                card.querySelector('.theme-cover').src = highResCover;
                                
                                card.onclick = (e) => {
                                    e.preventDefault();
                                    if (themeIsDragging) return; // Запрет открытия при скролле
                                    const searchId = track.collectionId || track.trackId;
                                    if (searchId) openMusicModal(searchId);
                                };
                            }
                        })
                        .catch(() => {}); // При ошибке остается красивый скриншот-заглушка
                }
            });
            themesWrapper.appendChild(scrollContainer);
            let isThemeDown = false, themeStartX, themeScrollLeft, themeIsDragging = false;
            scrollContainer.addEventListener('mousedown', (e) => { isThemeDown = true; themeIsDragging = false; scrollContainer.classList.add('is-dragging'); themeStartX = e.pageX - scrollContainer.offsetLeft; themeScrollLeft = scrollContainer.scrollLeft; e.preventDefault(); });
            scrollContainer.addEventListener('mouseleave', () => { isThemeDown = false; scrollContainer.classList.remove('is-dragging'); });
            scrollContainer.addEventListener('mouseup', () => { isThemeDown = false; scrollContainer.classList.remove('is-dragging'); });
            scrollContainer.addEventListener('mousemove', (e) => { if (!isThemeDown) return; e.preventDefault(); const walk = e.pageX - scrollContainer.offsetLeft - themeStartX; if (Math.abs(walk) > 5) themeIsDragging = true; scrollContainer.scrollLeft = themeScrollLeft - walk; });

            // Запрос на поиск полноценных альбомов (OST) и добавление их в общую ленту
            const albumQuery = encodeURIComponent(anime.title + ' OST');
            fetch(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&country=us&limit=10`)
                .then(res => res.json())
                .then(data => {
                    if (data.results && data.results.length > 0) return data;
                    return fetch(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&country=jp&limit=10`).then(r => r.json());
                })
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        data.results.forEach(album => {
                            const card = document.createElement('a');
                            card.className = 'theme-card';
                            card.href = 'javascript:void(0)';

                            const highResCover = album.artworkUrl100 ? album.artworkUrl100.replace('100x100bb', '300x300bb') : anime.images.jpg.image_url;

                            card.innerHTML = `
                                <div class="theme-cover-wrapper">
                                    <img class="theme-cover" src="${highResCover}" alt="Cover" loading="lazy">
                                    <div class="theme-type-badge" style="background: rgba(255, 69, 58, 0.8);">ALBUM</div>
                                </div>
                                <span class="theme-title">${album.collectionName}</span>
                                <span class="theme-artist">${album.artistName}</span>
                            `;
                            
                            card.onclick = (e) => {
                                e.preventDefault();
                                if (themeIsDragging) return;
                                openMusicModal(album.collectionId);
                            };
                            
                            scrollContainer.appendChild(card);
                        });
                    }
                })
                .catch(() => {}); // Игнорируем ошибку (альбомы просто не добавятся)
        }

        // Блок Фан-артов (отдельно от основного медиа)
        const fanartsWrapper = document.createElement('div');
        fanartsWrapper.style.width = '100vw';
        
        // Подготовка к бесконечному скроллу (сбрасываем старые значения)
        fanartSearchQuery = anime.title.split(':')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        fanartCurrentPage = 1;
        isFetchingFanarts = false;
        noMoreFanarts = false;
        globalFanartsMedia = [];
        
        // Загружаем первую страницу артов (40 штук)
        fetch(`https://danbooru.donmai.us/posts.json?tags=${fanartSearchQuery}&limit=40&page=${fanartCurrentPage}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                const validArts = data.filter(post => post.file_url);
                if (validArts.length > 0) {
                    const title = document.createElement('h3');
                    title.className = 'section-title';
                    title.textContent = 'Fan Arts';
                    fanartsWrapper.appendChild(title);

                    const scrollContainer = document.createElement('div');
                    // Используем стили от блока со скриншотами
                    scrollContainer.className = 'anime-screenshots-container'; 

                    // Добавляем все арты в общий массив галереи
                    validArts.forEach(art => {
                        globalFanartsMedia.push({ 
                            type: 'image', 
                            src: art.large_file_url || art.file_url,
                            preview: art.preview_file_url || art.file_url 
                        });
                    });

                    // Берем максимум 12 артов для ленты миниатюр
                    const displayArts = validArts.slice(0, 12);

                    displayArts.forEach((art, index) => {
                        const picImg = document.createElement('img');
                        picImg.src = art.preview_file_url || art.file_url;
                        picImg.className = 'anime-screenshot';
                        picImg.loading = 'lazy'; // Ленивая загрузка для ленты миниатюр
                        picImg.style.cursor = 'pointer';
                        
                        // Если рейтинг НЕ "General" (g) — добавляем блюр
                        if (art.rating !== 'g' && !fanartDisclaimerAccepted) {
                            picImg.classList.add('nsfw-blur');
                        }
                        
                        picImg.onclick = () => {
                            if (!fanartIsDragging) {
                                checkFanartDisclaimer(() => {
                                    galleryMedia = globalFanartsMedia;
                                    openModal(index);
                                });
                            }
                        };
                        scrollContainer.appendChild(picImg);
                    });

                    // Добавляем квадратную иконку "View all", если артов больше 12
                    if (validArts.length > 12) {
                        const viewAllBtn = document.createElement('div');
                        viewAllBtn.className = 'view-all-card';
                        viewAllBtn.innerHTML = '<span>View all</span>';
                        viewAllBtn.onclick = () => {
                            if (!fanartIsDragging) {
                                checkFanartDisclaimer(() => {
                                    openFanartGrid(); // Открываем сетку картинок
                                });
                            }
                        };
                        scrollContainer.appendChild(viewAllBtn);
                    }

                    fanartsWrapper.appendChild(scrollContainer);

                    // Логика драг-скролла для фан-артов
                    let isFanartDown = false, fanartStartX, fanartScrollLeft, fanartIsDragging = false;
                    scrollContainer.addEventListener('mousedown', (e) => { isFanartDown = true; fanartIsDragging = false; scrollContainer.classList.add('is-dragging'); fanartStartX = e.pageX - scrollContainer.offsetLeft; fanartScrollLeft = scrollContainer.scrollLeft; e.preventDefault(); });
                    scrollContainer.addEventListener('mouseleave', () => { isFanartDown = false; scrollContainer.classList.remove('is-dragging'); });
                    scrollContainer.addEventListener('mouseup', () => { isFanartDown = false; scrollContainer.classList.remove('is-dragging'); });
                    scrollContainer.addEventListener('mousemove', (e) => { if (!isFanartDown) return; e.preventDefault(); const walk = e.pageX - scrollContainer.offsetLeft - fanartStartX; if (Math.abs(walk) > 5) fanartIsDragging = true; scrollContainer.scrollLeft = fanartScrollLeft - walk; });
                }
            })
            .catch(() => {}); // Если фан-арты не найдены, блок просто останется пустым

        // Сборка страницы
        container.innerHTML = '';
        document.documentElement.style.setProperty('--bg-image', `url('${img.src}')`);

        container.appendChild(img);
        container.appendChild(titleElement);
        container.appendChild(metaElement); 
        if (typeof seasonsWrapper !== 'undefined' && seasonsWrapper) container.appendChild(seasonsWrapper); // Кнопки сезонов добавляются сверху
        if (loadedScreenshots.length > 0 || youtubeId) container.appendChild(screenshotsContainer);
        container.appendChild(synopsisElement);
        if (charactersWrapper.innerHTML) container.appendChild(charactersWrapper);
        if (themesWrapper.innerHTML) container.appendChild(themesWrapper);
        container.appendChild(fanartsWrapper); // Фан-арты добавляются в самом конце

        // --- БЛОК ВИДЕОПЛЕЕРА ---
        const playerWrapper = document.createElement('div');
        playerWrapper.style.width = '100vw';
        playerWrapper.style.marginTop = '20px'; 
        playerWrapper.style.paddingBottom = '40px'; 
        
        let playerHTML = `
            <h3 class="section-title">Watch Online</h3>
            <div style="padding: 0 20px; box-sizing: border-box; width: 100vw;">
        `;

        // Определяем, является ли это фильмом или 1-серийным аниме
        const isMovie = anime.type === 'Movie' || anime.episodes === 1;

        if (!isMovie) {
            // Контейнер эпизодов (показываем всегда для сериалов)
            playerHTML += `<div id="player-episode-buttons" class="player-buttons-container" style="margin-bottom: 15px;"></div>`;
        }

        playerHTML += `
                <div id="player-container">
                    <div style="color: #aaaaaa; text-align: center; padding: 20px;">Загрузка плеера...</div>
                </div>
            </div>
        `;
        
        playerWrapper.innerHTML = playerHTML;
        container.appendChild(playerWrapper);

        let currentSelectedEpisode = 1;

        const renderEpisodeButtons = () => {
            const epContainer = document.getElementById('player-episode-buttons');
            if (!epContainer) return;
            
            // Берем количество серий из текущего загруженного аниме
            let epCount = anime.episodes || 24;

            let epHTML = '';
            for (let i = 1; i <= epCount; i++) {
                const activeClass = i === 1 ? 'active' : '';
                epHTML += `<button class="player-episode-btn ${activeClass}" data-episode="${i}">ep. ${i}</button>`;
            }
            epContainer.innerHTML = epHTML;

            // Обработка кликов по сериям
            const epBtns = epContainer.querySelectorAll('.player-episode-btn');
            epBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    epBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentSelectedEpisode = btn.getAttribute('data-episode');
                    loadPlayer(currentSelectedEpisode);
                });
            });
        };

        // Драг-скролл для серий
        const epButtonsContainer = document.getElementById('player-episode-buttons');
        if (epButtonsContainer) {
            let isEBtnDown = false, eBtnStartX, eBtnScrollLeft;
            epButtonsContainer.addEventListener('mousedown', (e) => { 
                isEBtnDown = true; epButtonsContainer.classList.add('is-dragging'); 
                eBtnStartX = e.pageX - epButtonsContainer.offsetLeft; eBtnScrollLeft = epButtonsContainer.scrollLeft; e.preventDefault(); 
            });
            epButtonsContainer.addEventListener('mouseleave', () => { isEBtnDown = false; epButtonsContainer.classList.remove('is-dragging'); });
            epButtonsContainer.addEventListener('mouseup', () => { isEBtnDown = false; epButtonsContainer.classList.remove('is-dragging'); });
            epButtonsContainer.addEventListener('mousemove', (e) => { 
                if (!isEBtnDown) return; e.preventDefault(); 
                epButtonsContainer.scrollLeft = eBtnScrollLeft - (e.pageX - epButtonsContainer.offsetLeft - eBtnStartX); 
            });
        }

        const loadPlayer = async (episode = 1) => {
            const playerContainer = document.getElementById('player-container');
            
            // Встраиваем плеер Kodik. Параметр season убран, так как ID аниме (shikimoriID) уже соответствует конкретному сезону.
            playerContainer.innerHTML = `
                <div style="display: flex; justify-content: center;">
                    <iframe src="//kodikplayer.com/find-player?shikimoriID=${animeId}&episode=${episode}&hide_selectors=true" style="width: 85%; max-width: 800px; aspect-ratio: 16 / 9; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); background: #000; border: none;" allowfullscreen allow="autoplay *; fullscreen *"></iframe>
                </div>
            `;
        };
        
        // Инициализация при загрузке
        if (!isMovie) {
            renderEpisodeButtons();
        }
        loadPlayer(1);

        // ДОБАВЛЯЕМ СПИСОК СВЯЗАННОГО АНИМЕ СНИЗУ ПЛЕЕРА
        // Загружаем идеальное древо франшизы одним запросом с Shikimori
        fetch(`https://shikimori.one/api/animes/${animeId}/franchise`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data || !data.nodes) return;
                
                // Отфильтровываем мангу, ранобэ и прочую литературу, оставляем только аниме
                const invalidKinds = ['manga', 'light_novel', 'novel', 'one_shot', 'doujin', 'manhwa', 'manhua', 'oel'];
                const animeNodes = data.nodes.filter(n => !invalidKinds.includes(n.kind));

                if (animeNodes.length <= 1) return; // Нет франшизы, только мы сами

                // Сортируем: сначала по году выхода, если года равны - по ID (в порядке добавления в базу)
                animeNodes.sort((a, b) => {
                    const yearA = a.year || 9999;
                    const yearB = b.year || 9999;
                    if (yearA !== yearB) return yearA - yearB;
                    return a.id - b.id;
                });

                const relationsWrapper = document.createElement('div');
                relationsWrapper.style.width = '100vw';
                relationsWrapper.style.paddingBottom = '40px';
                
                let relHTML = `<div style="max-width: 800px; margin: 0 auto; padding: 0 20px; box-sizing: border-box;">`;
                relHTML += `<div class="related-list-container" id="chronology-list">`;
                relHTML += `<div class="related-list-header">chronology</div>`;
                
                animeNodes.forEach((node, index) => {
                    const isCurrent = node.id === parseInt(animeId);
                    const activeClass = isCurrent ? ' current-item' : '';
                    const yearText = node.year || 'TBA';
                    const displayType = node.kind === 'movie' ? 'Movie' : 'Collection';

                    relHTML += `
                        <div class="related-item${activeClass}" data-id="${node.id}">
                            <div class="related-content-wrapper">
                                <div class="related-number">${index + 1}</div>
                                <div class="related-left">
                                    <div class="related-type">${displayType}</div>
                                    <div class="related-name">${node.name}</div>
                                </div>
                            </div>
                            <div class="related-year">${yearText}</div>
                        </div>
                    `;
                });
                
                relHTML += `</div></div>`;
                relationsWrapper.innerHTML = relHTML;
                container.appendChild(relationsWrapper);
                
                const relatedItems = relationsWrapper.querySelectorAll('.related-item');
                relatedItems.forEach(item => {
                    item.addEventListener('click', () => {
                        if (item.classList.contains('current-item')) return;
                        const targetId = item.getAttribute('data-id');
                        showAnimeDetails(targetId, true);
                    });
                });
            })
            .catch(err => console.error('Ошибка при загрузке франшизы:', err));

        // После успешной загрузки сбрасываем фиксированную высоту
        container.style.minHeight = 'auto';
        
        // Если это было переключение из хронологии, плавно скроллим к плееру
        if (isRelatedSwitch) {
            const scrollTarget = document.getElementById('player-container');
            if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

    } catch (error) {
        console.error(error);
        container.style.minHeight = 'auto'; // Сбрасываем высоту при ошибке
        container.innerHTML = `<h2 style="color:red; text-align:center;">Ошибка: ${error.message}</h2>
                               <pre style="color:white; white-space:pre-wrap; padding:20px;">${error.stack}</pre>
                               <button class="btn" style="margin-top:20px;" onclick="closeAnimeDetails()">Назад</button>`;
    }
}

function closeAnimeDetails() {
    // Остановка аудио при выходе со страницы
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.ontimeupdate = null; // Отключаем старый трекинг
        currentAudio = null;
    }
    if (currentPlayingCard) {
        currentPlayingCard.classList.remove('playing');
        const oldBtn = currentPlayingCard.querySelector('.track-play-icon');
        if (oldBtn) {
            oldBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>`;
        }
        const oldProgress = currentPlayingCard.querySelector('.track-progress');
        if (oldProgress) oldProgress.style.width = '0%';
        currentPlayingCard = null;
    }

    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    window.scrollTo(0, mainScrollPosition); // Возвращаемся на то место, где остановились
    
    // Возвращаем фоновую картинку главного экрана
    if (mainBgImage) {
        document.documentElement.style.setProperty('--bg-image', mainBgImage);
    }
}

/* ==========================================================================
   ГАЛЕРЕЯ (FULLSCREEN MODAL)
   ========================================================================== */
function createMediaElement(item) {
    if (item.type === 'video') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${item.src}?autoplay=1`;
        iframe.allowFullscreen = true;
        return iframe;
    } else {
        const img = document.createElement('img');
        img.src = item.src;
        return img;
    }
}

function openModal(index) {
    currentMediaIndex = index;
    const modal = document.getElementById('image-modal');
    const existing = document.getElementById('full-media');
    if (existing) existing.remove(); 

    const media = createMediaElement(galleryMedia[currentMediaIndex]);
    media.id = 'full-media';
    media.style.transition = 'none';
    media.style.transform = 'translateX(0)';
    
    modal.appendChild(media);
    modal.classList.add('show');
    document.body.style.overflowY = 'hidden';
}

function changeModalImage(newIndex, direction) {
    if (isAnimating) return; 
    isAnimating = true;
    
    const modal = document.getElementById('image-modal');
    const oldMedia = document.getElementById('full-media');
    const newMedia = createMediaElement(galleryMedia[newIndex]);
    newMedia.id = 'full-media-new';
    
    newMedia.style.position = 'absolute';
    newMedia.style.transition = 'transform 0.3s ease-in-out';
    newMedia.style.transform = direction === 'next' ? 'translateX(100vw)' : 'translateX(-100vw)';
    modal.appendChild(newMedia);
    void newMedia.offsetWidth;
    
    oldMedia.style.transition = 'transform 0.3s ease-in-out';
    newMedia.style.transform = 'translateX(0)';
    oldMedia.style.transform = direction === 'next' ? 'translateX(-100vw)' : 'translateX(100vw)';
    
    setTimeout(() => {
        oldMedia.remove();
        newMedia.id = 'full-media'; 
        currentMediaIndex = newIndex;
        isAnimating = false;
    }, 300); 
}

function setupGalleryListeners() {
    const imageModal = document.getElementById('image-modal');
    
    const closeImageModal = () => {
        imageModal.classList.remove('show');
        const existing = document.getElementById('full-media');
        if (existing && existing.tagName.toLowerCase() === 'iframe') existing.src = ''; 
        
        // Возвращаем скролл только если сетка артов или музыка не открыты
        if (!document.getElementById('fanart-grid-modal').classList.contains('show') && !document.getElementById('music-modal').classList.contains('show')) {
            document.body.style.overflowY = 'auto'; 
        }
    };

    document.getElementById('close-image-modal').addEventListener('click', closeImageModal);
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) closeImageModal(); });

    document.getElementById('prev-image-btn').addEventListener('click', (e) => {
        e.stopPropagation(); 
        if (galleryMedia.length > 1) changeModalImage((currentMediaIndex - 1 + galleryMedia.length) % galleryMedia.length, 'prev');
    });

    document.getElementById('next-image-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (galleryMedia.length > 1) changeModalImage((currentMediaIndex + 1) % galleryMedia.length, 'next');
    });

    let touchStartX = 0, touchEndX = 0;
    imageModal.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    imageModal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX; 
        const swipeDistance = touchStartX - touchEndX; 
        if (swipeDistance > 50 && galleryMedia.length > 1) changeModalImage((currentMediaIndex + 1) % galleryMedia.length, 'next');
        else if (swipeDistance < -50 && galleryMedia.length > 1) changeModalImage((currentMediaIndex - 1 + galleryMedia.length) % galleryMedia.length, 'prev');
    });
}

function setupMusicModalListeners() {
    const musicModal = document.getElementById('music-modal');
    const closeBtn = document.getElementById('close-music-modal');

    const closeModal = () => {
        musicModal.classList.remove('show');
        
        // Остановка музыки при закрытии окна
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.ontimeupdate = null; // Отключаем старый трекинг
            currentAudio = null;
        }
        if (currentPlayingCard) {
            currentPlayingCard.classList.remove('playing');
            const oldBtn = currentPlayingCard.querySelector('.track-play-icon');
            if (oldBtn) {
                oldBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>`;
            }
            const oldProgress = currentPlayingCard.querySelector('.track-progress');
            if (oldProgress) oldProgress.style.width = '0%';
            currentPlayingCard = null;
        }

        // Возвращаем скролл только если галерея картинок не открыта
        if (!document.getElementById('image-modal').classList.contains('show')) {
            document.body.style.overflowY = 'auto';
        }
    };

    closeBtn.addEventListener('click', closeModal);
    musicModal.addEventListener('click', (e) => { if (e.target === musicModal) closeModal(); });
}

/* ==========================================================================
   УТИЛИТЫ
   ========================================================================== */
const fetchTimeout = (url, ms) => Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут')), ms))
]);

function toggleAudioModal(previewUrl, trackElement, playIconElement) {
    const svgPlay = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>`;
    const svgPause = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

    // Если нажали на трек, который уже играет/на паузе
    if (currentAudio && currentAudio.src === previewUrl) {
        if (currentAudio.paused) {
            currentAudio.play();
            playIconElement.innerHTML = svgPause;
            trackElement.classList.add('playing');
        } else {
            currentAudio.pause();
            playIconElement.innerHTML = svgPlay;
            trackElement.classList.remove('playing');
        }
        return;
    }

    // Если играл другой трек — ставим его на паузу и сбрасываем иконку
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.ontimeupdate = null;
        if (currentPlayingCard) {
            currentPlayingCard.classList.remove('playing');
            const oldIcon = currentPlayingCard.querySelector('.track-play-icon');
            if (oldIcon) oldIcon.innerHTML = svgPlay;
            const oldProgress = currentPlayingCard.querySelector('.track-progress');
            if (oldProgress) oldProgress.style.width = '0%';
        }
    }

    // Запускаем новый трек
    currentAudio = new Audio(previewUrl);
    currentAudio.volume = 0.5; // Громкость 50%
    currentAudio.play();
    currentPlayingCard = trackElement;
    trackElement.classList.add('playing');
    playIconElement.innerHTML = svgPause;

    const progressBar = trackElement.querySelector('.track-progress');
    
    // Обновляем полосу прогресса
    currentAudio.ontimeupdate = () => {
        if (currentAudio.duration && progressBar) {
            const percent = (currentAudio.currentTime / currentAudio.duration) * 100;
            progressBar.style.width = `${percent}%`;
        }
    };

    // Сброс иконки, когда трек (30 сек) закончился
    currentAudio.onended = () => {
        trackElement.classList.remove('playing');
        playIconElement.innerHTML = svgPlay;
        if (progressBar) progressBar.style.width = '0%';
    };
}

async function openMusicModal(collectionId) {
    const modal = document.getElementById('music-modal');
    const trackList = document.getElementById('music-modal-tracklist');
    const headerCover = document.getElementById('music-modal-cover');
    const headerTitle = document.getElementById('music-modal-title');
    const headerArtist = document.getElementById('music-modal-artist');
    const headerBlock = document.getElementById('music-modal-header');

    headerCover.src = '';
    headerTitle.textContent = 'Загрузка...';
    headerArtist.textContent = '';
    trackList.innerHTML = '<div style="color: #aaa; text-align: center; padding: 30px;">Ищем треки...</div>';
    
    modal.classList.add('show');
    document.body.style.overflowY = 'hidden';

    try {
        // Пробуем вытянуть англоязычные названия (US)
        let res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=us`);
        let data = await res.json();

        if (!data.results || data.results.length === 0) {
            // Запасной вариант - ищем оригинальные названия (JP)
            res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=jp`);
            data = await res.json();
        }

        if (!data.results || data.results.length === 0) throw new Error('Ничего не найдено');

        const collection = data.results.find(r => r.wrapperType === 'collection');
        const songs = data.results.filter(r => r.wrapperType === 'track');

        if (collection) {
            headerCover.src = collection.artworkUrl100.replace('100x100bb', '300x300bb');
            headerTitle.textContent = collection.collectionName;
            headerArtist.textContent = collection.artistName;
        }

        trackList.innerHTML = '';
        
        if (songs.length === 0) {
            trackList.innerHTML = '<div style="color: #aaa; text-align: center; padding: 30px;">Треки не найдены</div>';
            return;
        }

        const svgPlay = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>`;

        songs.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'music-track-item';
            
            item.innerHTML = `
                <div class="track-progress"></div>
                <div class="track-play-icon">${svgPlay}</div>
                <div class="track-number">${song.trackNumber || index + 1}</div>
                <div class="track-title">${song.trackName}</div>
            `;

            item.onclick = () => {
                if (song.previewUrl) {
                    const icon = item.querySelector('.track-play-icon');
                    toggleAudioModal(song.previewUrl, item, icon);
                } else {
                    item.style.backgroundColor = 'rgba(255,0,0,0.2)'; // Мигаем красным, если нет превью
                    setTimeout(() => item.style.backgroundColor = '', 300);
                }
            };

            trackList.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        trackList.innerHTML = '<div style="color: #ff453a; text-align: center; padding: 30px;">Ошибка загрузки данных</div>';
    }
}

/* ==========================================================================
   ОБРАБОТКА ДИСКЛЕЙМЕРА 18+
   ========================================================================== */
function checkFanartDisclaimer(callback) {
    if (fanartDisclaimerAccepted) {
        callback(); // Если уже соглашались, просто выполняем действие
    } else {
        onDisclaimerAccepted = callback; // Запоминаем, что хотели сделать
        document.getElementById('age-disclaimer-modal').classList.add('show');
    }
}

function setupAgeModalListeners() {
    document.getElementById('age-accept-btn').addEventListener('click', () => {
        fanartDisclaimerAccepted = true;
        document.getElementById('age-disclaimer-modal').classList.remove('show');
        document.querySelectorAll('.nsfw-blur').forEach(img => img.classList.remove('nsfw-blur'));
        if (onDisclaimerAccepted) {
            onDisclaimerAccepted();
            onDisclaimerAccepted = null;
        }
    });
    document.getElementById('age-close-btn').addEventListener('click', () => {
        document.getElementById('age-disclaimer-modal').classList.remove('show');
        onDisclaimerAccepted = null;
    });
}

/* ==========================================================================
   ГАЛЕРЕЯ СЕТКОЙ (ДЛЯ ФАН-АРТОВ)
   ========================================================================== */
function openFanartGrid() {
    const modal = document.getElementById('fanart-grid-modal');
    const gridContainer = document.getElementById('fanart-grid-container');
    
    gridContainer.innerHTML = ''; // Очищаем старые арты
    
    globalFanartsMedia.forEach((item, index) => {
        const img = document.createElement('img');
        img.src = item.preview || item.src; // Используем превью, чтобы не нагружать память
        img.className = 'fanart-grid-item';
        img.loading = 'lazy'; // Браузер сам решит, когда загрузить картинку при скролле
        
        img.onclick = () => {
            galleryMedia = globalFanartsMedia; // Устанавливаем текущую галерею
            openModal(index); // Поверх сетки открываем полноэкранный режим
        };
        
        gridContainer.appendChild(img);
    });
    
    modal.classList.add('show');
    document.body.style.overflowY = 'hidden';
}

async function loadMoreFanarts() {
    if (isFetchingFanarts || noMoreFanarts) return;
    isFetchingFanarts = true;
    fanartCurrentPage++; // Увеличиваем страницу (загружаем следующие 40)
    
    try {
        const res = await fetch(`https://danbooru.donmai.us/posts.json?tags=${fanartSearchQuery}&limit=40&page=${fanartCurrentPage}`);
        const data = res.ok ? await res.json() : [];
        const validArts = data.filter(post => post.file_url);
        
        if (validArts.length === 0) {
            noMoreFanarts = true; // Арты кончились
        } else {
            const gridContainer = document.getElementById('fanart-grid-container');
            const startIndex = globalFanartsMedia.length;
            
            validArts.forEach((art, idx) => {
                const mediaItem = { 
                    type: 'image', 
                    src: art.large_file_url || art.file_url,
                    preview: art.preview_file_url || art.file_url 
                };
                globalFanartsMedia.push(mediaItem);
                
                const img = document.createElement('img');
                img.src = mediaItem.preview;
                img.className = 'fanart-grid-item';
                img.loading = 'lazy'; // Ленивая загрузка для новых артов
                
                const currentIndex = startIndex + idx;
                img.onclick = () => {
                    galleryMedia = globalFanartsMedia; 
                    openModal(currentIndex); 
                };
                
                gridContainer.appendChild(img);
            });
        }
    } catch (err) {
        console.error('Ошибка при подгрузке фан-артов:', err);
    } finally {
        isFetchingFanarts = false;
    }
}

function setupFanartGridListeners() { const gridModal = document.getElementById('fanart-grid-modal'); const closeBtn = document.getElementById('close-fanart-grid'); const gridContainer = document.getElementById('fanart-grid-container'); const closeGridModal = () => { gridModal.classList.remove('show'); if (!document.getElementById('image-modal').classList.contains('show') && !document.getElementById('music-modal').classList.contains('show')) { document.body.style.overflowY = 'auto'; } }; closeBtn.addEventListener('click', closeGridModal); gridModal.addEventListener('click', (e) => { if (e.target === gridModal) closeGridModal(); }); gridContainer.addEventListener('scroll', () => { if (gridContainer.scrollTop + gridContainer.clientHeight >= gridContainer.scrollHeight - 300) { loadMoreFanarts(); } }); }
