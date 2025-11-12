document.addEventListener('DOMContentLoaded', async () => {
    let API_KEY = localStorage.getItem('API_KEY');
    let DB_URL = localStorage.getItem('DB_URL');

    let albumCache = [];
    const albumsGrid = document.getElementById('albums-grid');

    let queue = [];
    const queueButton = document.getElementById('queue-button');
    const queueCount = document.getElementById('queue-count');
    const queueMenuOverlay = document.getElementById('queue-menu-overlay');
    const closeQueueMenuButton = document.getElementById('close-queue-menu-button');
    const queueList = document.getElementById('queue-list');
    const clearQueueButton = document.getElementById('clear-queue-button');
    const compareButton = document.getElementById('compare-button');
    const detailActionButtonContainer = document.getElementById('detail-action-button-container');

    const comparisonModal = document.getElementById('comparison-modal');
    const closeComparisonButton = document.getElementById('close-comparison-button');
    const comparisonGrid = document.getElementById('comparison-grid');
    const comparisonNavigation = document.getElementById('comparison-navigation');
    const globalPrevBtn = document.getElementById('global-prev-btn');
    const globalNextBtn = document.getElementById('global-next-btn');
    const globalCounterCurrent = document.getElementById('global-image-counter-current');
    const globalCounterTotal = document.getElementById('global-image-counter-total');

    let globalImageIndex = 0;
    let maxImagesInQueue = 0;

    let isLoadingFromSharedUrl = false;

    const MIN_SKELETON_TIME = 0;

    function manageLazyLoadTransition(img, skeleton) {
        const startTime = Date.now();

        const onImageLoad = () => {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, MIN_SKELETON_TIME - elapsedTime);

            setTimeout(() => {
                if (img) {
                    img.classList.add('loaded');
                }
                if (skeleton) {
                    setTimeout(() => {
                        skeleton.style.opacity = '0';
                        setTimeout(() => skeleton.style.display = 'none', 300);
                    }, 400);
                }
            }, remainingTime);
        };

        img.onload = onImageLoad;
        img.onerror = () => {
            if (skeleton) {
                skeleton.style.display = 'none';
            }
        };

        img.src = img.dataset.src;
    }


    async function apiCall(userApiKey, userDbUrl, endpoint = '', method = 'GET', body = null) {
        if (!userApiKey || !userDbUrl) {
            throw new Error('API Key or DB URL not provided.');
        }
        const base = userDbUrl.endsWith('/') ? userDbUrl.slice(0, -1) : userDbUrl;
        const fullUrl = endpoint ? (base + (endpoint.startsWith('/') ? endpoint : '/' + endpoint)) : base;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-apikey': userApiKey,
                'cache-control': 'no-cache'
            }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                    message: response.statusText
                }));
                throw new Error(`API Error: ${response.status} - ${errorData.message || 'Unknown error'}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Call Failed:', error);
            throw error;
        }
    }

    function createAlbumCard(album) {
        const card = document.createElement('div');
        card.className = 'album-card bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden cursor-pointer transition-transform hover:-translate-y-1 select-none';

        card.dataset.id = album._id;
        card.dataset.title = album.title;
        card.dataset.description = album.description || 'No description available.';
        card.dataset.images = JSON.stringify(album.imageUrls);

        const imageUrl = album.imageUrls && album.imageUrls.length > 0 ? album.imageUrls[0] : '';

        card.innerHTML = `
            <div class="relative overflow-hidden">
                <div class="skeleton-loader absolute inset-0"></div>
                <img data-src="${imageUrl}" class="lazy-image image">
                <div class="absolute inset-0"></div>
            </div>
            <div class="p-3"><h3 class="album-title text-lg font-semibold">${album.title}</h3></div>
        `;
        return card;
    }

    async function fetchAndDisplayAlbums() {
        albumsGrid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'album-card bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden';
            skeletonCard.innerHTML = `
                <div class="relative overflow-hidden h-full">
                    <div class="skeleton-loader absolute inset-0"></div>
                </div>`;
            albumsGrid.appendChild(skeletonCard);
        }

        try {
            const albums = await apiCall(API_KEY, DB_URL);
            albumsGrid.innerHTML = '';

            albums.forEach(album => {
                const card = createAlbumCard(album);
                albumsGrid.appendChild(card);
            });

            initializeAlbumCardLogic();

        } catch (error) {
            albumsGrid.innerHTML = `<p class="text-red-500 col-span-full text-center">Failed to load albums. Please check your API credentials in the menu and your network connection.</p>`;
        }
    }

    function initializeAlbumCardLogic() {
        document.querySelectorAll('.album-card').forEach(card => {
            card.replaceWith(card.cloneNode(true));
        });

        document.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => handleCardClick(card));
        });

        albumCache = [];
        document.querySelectorAll('.album-card').forEach(card => {
            albumCache.push({
                id: card.dataset.id,
                title: card.querySelector('.album-title').textContent.toLowerCase(),
                element: card
            });
        });

        const lazyImages = document.querySelectorAll('#albums-grid .lazy-image');
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const skeleton = img.previousElementSibling;
                        if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                            manageLazyLoadTransition(img, skeleton);
                        }
                        observer.unobserve(img);
                    }
                });
            }, {
                root: albumsGrid,
                rootMargin: '100px 0px',
                threshold: 0.01
            });
            lazyImages.forEach(img => imageObserver.observe(img));
        } else {
            lazyImages.forEach(img => {
                img.src = img.dataset.src;
                img.classList.add('loaded');
            });
        }
    }


    const searchInput = document.getElementById('search-input');
    const clearSearchButton = document.getElementById('clear-search-button');
    const suggestionsBox = document.getElementById('suggestions-box');
    let selectedSuggestionIndex = -1;

    const filterAlbums = (query) => {
        query = query.toLowerCase();
        const transitionDuration = 300;

        albumCache.forEach(album => {
            const isVisible = album.title.includes(query);
            const card = album.element;
            const isHidden = card.classList.contains('hidden-by-filter');

            if (isVisible && isHidden) {

                card.style.display = '';
                setTimeout(() => {
                    card.classList.remove('hidden-by-filter');
                }, 10);

            } else if (!isVisible && !isHidden) {

                card.classList.add('hidden-by-filter');
                setTimeout(() => {
                    card.style.display = 'none';
                }, transitionDuration);
            }
        });
    };

    const showSuggestions = (query) => {
        selectedSuggestionIndex = -1;
        if (!query) {
            suggestionsBox.classList.add('hidden');
            return;
        }
        const matchedAlbums = albumCache
            .filter(album => album.title.includes(query.toLowerCase()))
            .map(album => album.title);

        if (matchedAlbums.length > 0) {
            suggestionsBox.innerHTML = matchedAlbums
                .map((title, index) => `<div class="suggestion-item p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors" data-index="${index}">${title}</div>`)
                .join('');
            suggestionsBox.classList.remove('hidden');
        } else {
            suggestionsBox.classList.add('hidden');
        }
    };

    const updateSuggestionSelection = () => {
        const suggestions = suggestionsBox.querySelectorAll('.suggestion-item');
        suggestions.forEach((item, index) => {
            if (index === selectedSuggestionIndex) {
                item.classList.add('selected-suggestion');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected-suggestion');
            }
        });
    };

    const selectCurrentSuggestion = () => {
        const suggestions = suggestionsBox.querySelectorAll('.suggestion-item');
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
            const selectedText = suggestions[selectedSuggestionIndex].textContent;
            searchInput.value = selectedText;
            filterAlbums(selectedText);
            suggestionsBox.classList.add('hidden');
            selectedSuggestionIndex = -1;
        }
    };

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        filterAlbums(query);
        showSuggestions(query);
        clearSearchButton.classList.toggle('hidden', !query);
    });

    searchInput.addEventListener('keydown', (e) => {
        const suggestions = suggestionsBox.querySelectorAll('.suggestion-item');
        const suggestionsVisible = !suggestionsBox.classList.contains('hidden');

        if (e.key === 'ArrowDown' && suggestionsVisible) {
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
            updateSuggestionSelection();
        } else if (e.key === 'ArrowUp' && suggestionsVisible) {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            if (selectedSuggestionIndex === -1) {
                suggestions.forEach(item => item.classList.remove('selected-suggestion'));
            } else {
                updateSuggestionSelection();
            }
        } else if (e.key === 'Enter' && suggestionsVisible && selectedSuggestionIndex >= 0) {
            e.preventDefault();
            selectCurrentSuggestion();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (suggestionsVisible) {
                suggestionsBox.classList.add('hidden');
                selectedSuggestionIndex = -1;
            } else if (searchInput.value) {
                searchInput.value = '';
                filterAlbums('');
                clearSearchButton.classList.add('hidden');
            }
        }
    });

    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        filterAlbums('');
        suggestionsBox.classList.add('hidden');
        clearSearchButton.classList.add('hidden');
        selectedSuggestionIndex = -1;
    });

    suggestionsBox.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-item')) {
            searchInput.value = e.target.textContent;
            filterAlbums(e.target.textContent);
            suggestionsBox.classList.add('hidden');
            selectedSuggestionIndex = -1;
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.relative')) {
            suggestionsBox.classList.add('hidden');
            selectedSuggestionIndex = -1;
        }
    });

    const lazyLoadDetailImages = () => {
        const detailImages = document.querySelectorAll('#detail-image-gallery .lazy-image');
        detailImages.forEach(img => {
            const skeleton = img.previousElementSibling;
            if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                manageLazyLoadTransition(img, skeleton);
            }
        });
    };

    const lazyLoadComparisonImages = () => {
        const comparisonImages = document.querySelectorAll('.comparison-lazy-image');

        if ('IntersectionObserver' in window) {
            const comparisonObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const skeleton = img.previousElementSibling;

                        img.onload = () => {
                            img.classList.add('loaded');
                            if (skeleton && skeleton.classList.contains('comparison-skeleton-loader')) {
                                setTimeout(() => {
                                    skeleton.style.display = 'none';
                                }, 400);
                            }
                        };

                        img.onerror = () => {
                            if (skeleton && skeleton.classList.contains('comparison-skeleton-loader')) {
                                skeleton.style.display = 'none';
                            }
                            img.classList.add('loaded');
                        };

                        img.src = img.dataset.src;
                        observer.unobserve(img);
                    }
                });
            }, {
                root: comparisonGrid,
                rootMargin: '50px 0px',
                threshold: 0.01
            });

            comparisonImages.forEach(img => comparisonObserver.observe(img));
        } else {
            comparisonImages.forEach(img => {
                const skeleton = img.previousElementSibling;
                img.onload = () => {
                    img.classList.add('loaded');
                    if (skeleton && skeleton.classList.contains('comparison-skeleton-loader')) {
                        setTimeout(() => {
                            skeleton.style.display = 'none';
                        }, 400);
                    }
                };
                img.src = img.dataset.src;
            });
        }
    };

    function updateGridQueueStyles() {
        const queuedIds = new Set(queue.map(album => album._id));
        albumCache.forEach(cachedAlbum => {
            if (queuedIds.has(cachedAlbum.id)) {
                cachedAlbum.element.classList.add('queued');
            } else {
                cachedAlbum.element.classList.remove('queued');
            }
        });
    }

    function updateQueueButton() {
        const oldLength = parseInt(queueCount.textContent, 10);
        const newLength = queue.length;

        queueCount.textContent = newLength;

        if (newLength > 0) {
            queueButton.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        } else {
            queueButton.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
            closeQueueMenu();
        }

        if (oldLength !== newLength) {
            queueButton.classList.add('animate-queue-button');
            setTimeout(() => {
                queueButton.classList.remove('animate-queue-button');
            }, 400);
        }
    }

    function renderQueueList() {
        queueList.innerHTML = '';
        if (queue.length === 0) {
            queueList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center">The queue is empty.</p>`;
            return;
        }

        queue.forEach(album => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg';
            item.innerHTML = `
                <span class="font-medium truncate pr-4">${album.title}</span>
                <button data-id="${album._id}" class="remove-from-queue-btn flex-shrink-0 bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                </button>
            `;
            queueList.appendChild(item);
        });

        document.querySelectorAll('.remove-from-queue-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                removeFromQueue(btn.dataset.id);
            });
        });
    }

    function addToQueue(albumData) {
        if (!queue.some(item => item._id === albumData._id)) {
            queue.push(albumData);
            updateQueueButton();
            renderQueueList();
            updateDetailActionButton();
            updateGridQueueStyles();
        }
    }

    function removeFromQueue(albumId) {
        queue = queue.filter(item => item._id !== albumId);
        updateQueueButton();
        renderQueueList();
        updateDetailActionButton();
        updateGridQueueStyles();
    }

    function openQueueMenu() {
        renderQueueList();
        queueMenuOverlay.classList.remove('opacity-0', 'pointer-events-none');
        queueMenuOverlay.querySelector('div').classList.remove('scale-95');
    }

    function closeQueueMenu() {
        queueMenuOverlay.classList.add('opacity-0');
        queueMenuOverlay.querySelector('div').classList.add('scale-95');
        setTimeout(() => queueMenuOverlay.classList.add('pointer-events-none'), 300);
    }

    function updateDetailActionButton() {
        if (!currentlyOpenCard) return;

        const id = currentlyOpenCard.dataset.id;
        const isInQueue = queue.some(item => item._id === id);
        detailActionButtonContainer.innerHTML = '';

        let button;
        if (isInQueue) {
            button = document.createElement('button');
            button.className = 'bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors h-full w-full flex items-center justify-center';
            button.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>`;
            button.onclick = () => {
                removeFromQueue(id);
                closeDetailView();
            };
        } else {
            button = document.createElement('button');
            button.className = 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors h-full w-full flex items-center justify-center';
            button.innerHTML = `+`;
            button.style.fontSize = '2.5rem';
            button.style.lineHeight = '1';
            button.onclick = () => {
                const albumData = {
                    _id: currentlyOpenCard.dataset.id,
                    title: currentlyOpenCard.dataset.title,
                    description: currentlyOpenCard.dataset.description,
                    imageUrls: JSON.parse(currentlyOpenCard.dataset.images || '[]')
                };
                addToQueue(albumData);
                closeDetailView();
            };
        }
        detailActionButtonContainer.appendChild(button);
    }

    queueButton.addEventListener('click', openQueueMenu);
    closeQueueMenuButton.addEventListener('click', closeQueueMenu);
    queueMenuOverlay.addEventListener('click', (e) => {
        if (e.target === queueMenuOverlay) closeQueueMenu();
    });
    clearQueueButton.addEventListener('click', () => {
        queue = [];
        updateQueueButton();
        renderQueueList();
        updateDetailActionButton();
        updateGridQueueStyles();
    });

    function hideComparisonView() {
        comparisonModal.classList.add('opacity-0', 'pointer-events-none');
    }

    function generateShareableUrl() {
        const shareData = {
            db: DB_URL,
            albums: queue.map(album => album._id),
            page: globalImageIndex
        };


        const encoded = btoa(JSON.stringify(shareData));
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?compare=${encodeURIComponent(encoded)}`;
    }

    async function shareComparison() {
        try {
            const shareUrl = generateShareableUrl();
            await navigator.clipboard.writeText(shareUrl);


            const shareBtn = document.getElementById('share-comparison-btn');
            const originalContent = shareBtn.innerHTML;
            shareBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Copied!</span>
            `;
            shareBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            shareBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');

            setTimeout(() => {
                shareBtn.innerHTML = originalContent;
                shareBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                shareBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            }, 2000);
        } catch (error) {
            console.error('Failed to share comparison:', error);
            alert('Failed to copy share link. Please try again.');
        }
    }

    function parseSharedUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const compareParam = urlParams.get('compare');

        if (!compareParam) {
            return null;
        }

        try {
            const decoded = atob(decodeURIComponent(compareParam));
            const shareData = JSON.parse(decoded);


            if (!shareData.db || !Array.isArray(shareData.albums) || shareData.albums.length < 2) {
                throw new Error('Invalid share data structure');
            }

            return shareData;
        } catch (error) {
            console.error('Failed to parse shared URL:', error);
            return null;
        }
    }

    function showBlockingOverlay(message = 'Loading…') {
        const overlay = document.getElementById('app-blocking-overlay');
        const msg = document.getElementById('overlay-message');
        if (!overlay || !msg) return;
        msg.textContent = message;
        overlay.classList.remove('opacity-0', 'pointer-events-none');
    }

    function updateBlockingOverlay(message) {
        const msg = document.getElementById('overlay-message');
        if (msg) msg.textContent = message;
    }

    function hideBlockingOverlay() {
        const overlay = document.getElementById('app-blocking-overlay');
        if (!overlay) return;
        overlay.classList.add('opacity-0');
        overlay.classList.add('pointer-events-none');
    }

    function showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        const base = 'px-4 py-3 rounded-lg shadow-lg text-white flex items-center gap-2 backdrop-blur-md border';
        const color = type === 'success' ? 'bg-green-600/90 border-green-400/40' : type === 'warning' ? 'bg-yellow-600/90 border-yellow-400/40' : 'bg-red-600/90 border-red-400/40';
        toast.className = `${base} ${color}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    async function loadSharedComparison() {
        const shareData = (() => {
            const params = new URLSearchParams(window.location.search);
            if (!params.get('compare')) return null;
            showBlockingOverlay('Deciphering URL parameters…');
            const parsed = parseSharedUrl();
            if (!parsed) {
                hideBlockingOverlay();
                showToast('Invalid or corrupted shared URL.', 'error');

                window.history.replaceState({}, document.title, window.location.pathname);
                return null;
            }
            return parsed;
        })();

        if (!shareData) {
            return;
        }

        isLoadingFromSharedUrl = true;


        updateBlockingOverlay('Validating database endpoint…');
        if (shareData.db !== DB_URL) {
            hideBlockingOverlay();
            showToast('Shared comparison uses a different database endpoint. Opening settings…', 'error');


            const dbUrlInput = document.getElementById('db-url-input');
            const menuOverlay = document.getElementById('popup-menu-overlay');
            const popupMenuContainer = menuOverlay ? menuOverlay.querySelector('div') : null;
            const popupMenu = document.getElementById('popup-menu');
            const settingsView = document.getElementById('settings-view');


            if (dbUrlInput) dbUrlInput.value = shareData.db;


            if (menuOverlay && popupMenuContainer && popupMenu && settingsView) {
                menuOverlay.classList.remove('opacity-0', 'pointer-events-none');
                popupMenuContainer.classList.remove('scale-95');
                popupMenu.classList.add('hidden');
                settingsView.classList.remove('hidden');
            }

            isLoadingFromSharedUrl = false;


            sessionStorage.setItem('pendingSharedComparison', JSON.stringify(shareData));
            return;
        }


        if (!API_KEY || !DB_URL) {
            hideBlockingOverlay();
            showToast('Please configure your API credentials in settings first.', 'error');


            const menuOverlay = document.getElementById('popup-menu-overlay');
            const popupMenuContainer = menuOverlay ? menuOverlay.querySelector('div') : null;
            const popupMenu = document.getElementById('popup-menu');
            const settingsView = document.getElementById('settings-view');


            if (menuOverlay && popupMenuContainer && popupMenu && settingsView) {
                menuOverlay.classList.remove('opacity-0', 'pointer-events-none');
                popupMenuContainer.classList.remove('scale-95');
                popupMenu.classList.add('hidden');
                settingsView.classList.remove('hidden');
            }

            isLoadingFromSharedUrl = false;


            sessionStorage.setItem('pendingSharedComparison', JSON.stringify(shareData));
            return;
        }


        updateBlockingOverlay('Loading albums…');


        try {
            const albums = await apiCall(API_KEY, DB_URL);
            const albumMap = new Map(albums.map(album => [album._id, album]));


            const availableAlbums = [];
            const missingAlbums = [];

            for (const albumId of shareData.albums) {
                if (albumMap.has(albumId)) {
                    availableAlbums.push(albumMap.get(albumId));
                } else {
                    missingAlbums.push(albumId);
                }
            }

            if (availableAlbums.length < 2) {
                hideBlockingOverlay();
                showToast(`Cannot load comparison: ${missingAlbums.length} album(s) not found in database.`, 'error');
                window.history.replaceState({}, document.title, window.location.pathname);
                isLoadingFromSharedUrl = false;
                return;
            }


            if (missingAlbums.length > 0) {
                showToast(`Warning: ${missingAlbums.length} album(s) from the shared comparison are not available.`, 'warning');
            }


            queue = availableAlbums;
            updateQueueButton();
            updateGridQueueStyles();


            globalImageIndex = shareData.page || 0;


            hideBlockingOverlay();
            showComparisonView();
            isLoadingFromSharedUrl = false;


            window.history.replaceState({}, document.title, window.location.pathname);

        } catch (error) {
            console.error('Failed to load shared comparison:', error);
            hideBlockingOverlay();
            showToast('Failed to load shared comparison. Please check your connection.', 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
            isLoadingFromSharedUrl = false;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function extractImageMetadata(imageUrl) {
        try {
            const metadata = await ExifReader.load(imageUrl);
            return metadata || null;
        } catch (error) {
            console.warn('Failed to extract metadata from image:', imageUrl, error);
            return null;
        }
    }

    function parseAndFormatLoras(lorasString) {
        if (!lorasString) return 'N/A';

        const loraRegex = /<lora:([^:>]+)(?::([^:>]+))?[^>]*>/g;
        const matches = [];
        let match;

        while ((match = loraRegex.exec(lorasString)) !== null) {
            const name = match[1];
            const weight = match[2];
            matches.push({ name, weight });
        }

        if (matches.length === 0) return escapeHtml(lorasString);

        return matches.map(lora => {
            const escapedName = escapeHtml(lora.name);
            const displayName = `<span style="color: #a78bfa; font-weight: 600;">${escapedName}</span>`;
            const displayWeight = lora.weight ? `:<span style="color: #a78bfa; font-weight: 600;">${escapeHtml(lora.weight)}</span>` : '';
            return displayName + displayWeight;
        }).join(' → ');
    }

    function parseAndFormatCheckpoint(checkpointString) {
        if (!checkpointString) return 'N/A';

        const checkpointRegex = /<checkpoint:([^>]+)>/g;
        const match = checkpointRegex.exec(checkpointString);

        if (match) {
            return `<span style="color: #fbbf24; font-weight: 600;">${escapeHtml(match[1])}</span>`;
        }

        return escapeHtml(checkpointString);
    }

    function formatMetadataValue(value, fieldKey) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'object') return escapeHtml(JSON.stringify(value));

        const stringValue = String(value);


        if (fieldKey === 'user_loras') {
            return parseAndFormatLoras(stringValue);
        }


        if (fieldKey === 'user_checkpoint') {
            return parseAndFormatCheckpoint(stringValue);
        }

        return escapeHtml(stringValue);
    }

    async function copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalContent = button.innerHTML;
            button.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copied!`;
            button.classList.add('copied');
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            button.innerHTML = 'Error';
            setTimeout(() => {
                button.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg> Copy`;
            }, 1500);
        }
    }

    function createMetadataTooltip(metadata) {
        const tooltip = document.createElement('div');
        tooltip.className = 'metadata-tooltip';

        if (!metadata) {
            tooltip.innerHTML = '<div class="metadata-no-data">No metadata available</div>';
            return tooltip;
        }

        const fields = [
            { key: 'user_prompt', label: 'Prompt', isPrompt: true },
            { key: 'user_loras', label: 'LoRAs' },
            { key: 'user_checkpoint', label: 'Checkpoint' },
            { key: 'user_sampler', label: 'Sampler' },
            { key: 'user_scheduler', label: 'Scheduler' },
            { key: 'DateTime', label: 'Date' },
            { key: 'DateTimeOriginal', label: 'Created' },
            { key: 'CreateDate', label: 'Create Date' },
        ];

        let hasData = false;
        let htmlContent = '';

        fields.forEach(field => {
            const value = metadata[field.key]?.description;
            if (value !== null && value !== undefined) {
                hasData = true;
                const formattedValue = formatMetadataValue(value, field.key);
                const rawValue = String(value);

                if (field.isPrompt && formattedValue !== 'N/A') {
                    htmlContent += `
                        <div class="metadata-row">
                            <span class="metadata-label">${field.label}:</span>
                            <div class="metadata-value metadata-prompt">
                                <div class="metadata-prompt-text">${formattedValue}</div>
                                <button class="metadata-copy-btn" data-copy-text="${rawValue.replace(/"/g, '&quot;')}">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                    </svg>
                                    Copy
                                </button>
                            </div>
                        </div>
                    `;
                } else if (formattedValue !== 'N/A') {
                    htmlContent += `
                        <div class="metadata-row">
                            <span class="metadata-label">${field.label}:</span>
                            <span class="metadata-value">${formattedValue}</span>
                        </div>
                    `;
                }
            }
        });

        if (!hasData) {
            tooltip.innerHTML = '<div class="metadata-no-data">No metadata available</div>';
        } else {
            tooltip.innerHTML = htmlContent;


            setTimeout(() => {
                tooltip.querySelectorAll('.metadata-copy-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const textToCopy = btn.dataset.copyText;
                        copyToClipboard(textToCopy, btn);
                    });
                });
            }, 0);
        }

        return tooltip;
    }

    async function loadMetadataForImage(imageContainer, imageUrl) {
        if (imageContainer.querySelector('.metadata-tooltip:not(.metadata-loading-wrapper)')) {
            return;
        }

        const loadingTooltip = document.createElement('div');
        loadingTooltip.className = 'metadata-tooltip metadata-loading-wrapper';
        loadingTooltip.innerHTML = `
            <div class="metadata-loading">
                <div class="metadata-spinner"></div>
                <span>Loading metadata...</span>
            </div>
        `;
        imageContainer.appendChild(loadingTooltip);

        const metadata = await extractImageMetadata(imageUrl);

        loadingTooltip.remove();

        const tooltip = createMetadataTooltip(metadata);
        imageContainer.appendChild(tooltip);
    }

    function computeComparisonLayout(count) {
        const paddingTop = 4.5 * 16;
        const paddingBottom = 4.5 * 16;
        const paddingSides = 1.5 * 16;

        const viewportWidth = window.innerWidth - paddingSides * 2;
        const viewportHeight = window.innerHeight - paddingTop - paddingBottom;

        if (count <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
            return {
                cols: 1,
                rows: 1,
                cellWidth: viewportWidth,
                cellHeight: viewportHeight
            };
        }

        const targetImageAspect = 1056 / 1536;
        let best = null;

        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);
            if (rows <= 0) continue;

            const cellWidth = viewportWidth / cols;
            const cellHeight = viewportHeight / rows;

            const cellAspect = cellWidth / cellHeight;

            const area = cellWidth * cellHeight;
            const aspectPenalty = Math.abs(Math.log((cellAspect || 1) / targetImageAspect));
            const score = area / (1 + aspectPenalty * 1.5);

            if (!best || score > best.score) {
                best = { cols, rows, cellWidth, cellHeight, score };
            }
        }

        return best || {
            cols: 1,
            rows: count,
            cellWidth: viewportWidth,
            cellHeight: viewportHeight / count
        };
    }

    function layoutComparisonItems() {
        const items = Array.from(document.querySelectorAll('.comparison-item'));
        const count = items.length;
        if (count === 0) return;

        const paddingTop = 4.5 * 16;
        const paddingBottom = 4.5 * 16;
        const paddingSides = 1.5 * 16;
        const gap = 4;

        const viewportWidth = window.innerWidth - paddingSides * 2;
        const viewportHeight = window.innerHeight - paddingTop - paddingBottom;

        const { cols, rows, cellWidth, cellHeight } = computeComparisonLayout(count);

        const targetAspect = 1056 / 1536;

        const tileWidth = cellWidth - gap;
        const tileHeight = tileWidth / targetAspect;

        const maxTotalHeight = viewportHeight;
        const rowsNeededHeight = rows * tileHeight + (rows - 1) * gap;
        let finalTileWidth = tileWidth;
        let finalTileHeight = tileHeight;

        if (rowsNeededHeight > maxTotalHeight) {
            finalTileHeight = (maxTotalHeight - (rows - 1) * gap) / rows;
            finalTileWidth = finalTileHeight * targetAspect;
        }

        const usedWidth = cols * finalTileWidth + (cols - 1) * gap;
        const usedHeight = rows * finalTileHeight + (rows - 1) * gap;

        const offsetX = paddingSides + (viewportWidth - usedWidth) / 2;
        const offsetY = paddingTop + (viewportHeight - usedHeight) / 2;

        comparisonGrid.style.position = 'fixed';
        comparisonGrid.style.inset = '0';
        comparisonGrid.style.padding = '0';
        comparisonGrid.style.margin = '0';
        comparisonGrid.style.overflow = 'hidden';

        items.forEach((item, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            const x = offsetX + col * (finalTileWidth + gap);
            const y = offsetY + row * (finalTileHeight + gap);


            item.style.position = 'absolute';
            item.style.boxSizing = 'border-box';
            item.style.left = `${x}px`;
            item.style.top = `${y}px`;
            item.style.width = `${finalTileWidth}px`;
            item.style.height = `${finalTileHeight}px`;
            item.style.margin = '0';
            item.style.padding = '0';
            item.style.display = 'block';

            const container = item.querySelector('.image-container');
            if (container) {
                container.style.position = 'relative';
                container.style.left = '0';
                container.style.top = '0';
                container.style.width = `${finalTileWidth}px`;
                container.style.height = `${finalTileHeight}px`;
                container.style.margin = '0';
                container.style.padding = '0';
                container.style.display = 'block';
                container.style.overflow = 'hidden';
            }

            const img = item.querySelector('img');
            if (img) {
                img.style.position = 'absolute';
                img.style.left = '0';
                img.style.top = '0';
                img.style.width = `${finalTileWidth}px`;
                img.style.height = `${finalTileHeight}px`;
                img.style.objectFit = 'contain';
                img.style.margin = '0';
                img.style.padding = '0';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
                img.style.display = 'block';
            }

            const tooltip = item.querySelector('.metadata-tooltip');
            if (tooltip && container) {
                tooltip.style.position = 'absolute';
                tooltip.style.right = '1rem';
                tooltip.style.left = '1rem';
                tooltip.style.bottom = '1rem';
                tooltip.style.maxWidth = `${finalTileWidth - 12}px`;
            }
        });
    }

    /**
     * Render the comparison view:
     * - One item per queued album.
     * - Starting image index = globalImageIndex (supports sharing).
     * - Then we delegate exact positioning/sizing to layoutComparisonItems().
     */
    function showComparisonView() {
        if (queue.length < 2) {
            alert("Please add at least two albums to the queue to compare.");
            return;
        }

        isLoadingImages = true;
        setNavigationEnabled(false);
        currentLoadingIndex = 0;

        maxImagesInQueue = Math.max(0, ...queue.map(album => album.imageUrls.length));

        comparisonGrid.innerHTML = '';

        let imagesToLoad = queue.length;
        let imagesLoaded = 0;

        const onImageDone = () => {
            imagesLoaded++;
            if (imagesLoaded >= imagesToLoad) {
                isLoadingImages = false;
                setNavigationEnabled(true);
                layoutComparisonItems();
            }
        };

        queue.forEach((album, queueIndex) => {
            const item = document.createElement('div');
            item.className = 'comparison-item';
            item.dataset.queueIndex = queueIndex;

            const imageIndexForThisAlbum = album.imageUrls.length > 0
                ? globalImageIndex % album.imageUrls.length
                : 0;
            const imageUrl = album.imageUrls.length > 0
                ? album.imageUrls[imageIndexForThisAlbum]
                : '';

            item.innerHTML = `
                <div class="image-container">
                    <div class="comparison-skeleton-loader"></div>
                    <img data-src="${imageUrl}" class="comparison-lazy-image" title="${escapeHtml(album.title)}">
                </div>
            `;
            comparisonGrid.appendChild(item);

            const img = item.querySelector('.comparison-lazy-image');
            const skeleton = item.querySelector('.comparison-skeleton-loader');
            const imageContainer = item.querySelector('.image-container');


            item.metadataLoaded = false;
            item.addEventListener('mouseenter', () => {
                if (!item.metadataLoaded) {
                    const currentImageUrl = img.dataset.src;
                    if (currentImageUrl) {
                        item.metadataLoaded = true;
                        loadMetadataForImage(imageContainer, currentImageUrl);
                    }
                }
            });

            img.onload = () => {
                img.classList.add('loaded');
                if (skeleton) {
                    setTimeout(() => {
                        skeleton.style.display = 'none';
                    }, 200);
                }
                onImageDone();
            };

            img.onerror = () => {
                if (skeleton) {
                    skeleton.style.display = 'none';
                }
                onImageDone();
            };


            img.src = imageUrl;
        });

        updateGlobalCounter();
        comparisonModal.classList.remove('opacity-0', 'pointer-events-none');


        const handleResize = () => {
            if (comparisonModal.classList.contains('pointer-events-none')) return;
            layoutComparisonItems();
        };
        window.addEventListener('resize', handleResize, { passive: true });


        comparisonModal._resizeHandler = handleResize;
    }

    /**
     * NEW: Updates the global counter display and button states.
     */
    function updateGlobalCounter() {
        if (maxImagesInQueue === 0) {
            globalCounterCurrent.textContent = '0';
            globalCounterTotal.textContent = '0';
        } else {
            globalCounterCurrent.textContent = globalImageIndex + 1;
            globalCounterTotal.textContent = maxImagesInQueue;
        }
        globalPrevBtn.disabled = globalImageIndex === 0;
        globalNextBtn.disabled = globalImageIndex >= maxImagesInQueue - 1;
    }

    let currentLoadingIndex = 0;
    let isLoadingImages = false;

    function setNavigationEnabled(enabled) {
        const prevButton = document.getElementById('global-prev-btn');
        const nextButton = document.getElementById('global-next-btn');

        if (prevButton && nextButton) {
            if (enabled) {
                prevButton.disabled = globalImageIndex <= 0;
                nextButton.disabled = globalImageIndex >= maxImagesInQueue - 1;
                prevButton.style.cursor = prevButton.disabled ? 'not-allowed' : 'pointer';
                nextButton.style.cursor = nextButton.disabled ? 'not-allowed' : 'pointer';
                prevButton.style.opacity = prevButton.disabled ? '0.4' : '1';
                nextButton.style.opacity = nextButton.disabled ? '0.4' : '1';
            } else {
                prevButton.disabled = true;
                nextButton.disabled = true;
                prevButton.style.cursor = 'wait';
                nextButton.style.cursor = 'wait';
                prevButton.style.opacity = '0.5';
                nextButton.style.opacity = '0.5';
            }
        }
    }

    function updateAllComparisonImages(newIndex) {
        if (newIndex < 0 || newIndex >= maxImagesInQueue || isLoadingImages) {
            return;
        }

        globalImageIndex = newIndex;
        isLoadingImages = true;
        setNavigationEnabled(false);

        const comparisonItems = document.querySelectorAll('.comparison-item');
        let imagesToLoad = comparisonItems.length;
        let imagesLoaded = 0;

        const checkAllLoaded = () => {
            imagesLoaded++;
            if (imagesLoaded >= imagesToLoad) {
                isLoadingImages = false;
                setNavigationEnabled(true);
                layoutComparisonItems();
            }
        };

        comparisonItems.forEach(item => {
            const img = item.querySelector('img');
            const imageContainer = item.querySelector('.image-container');
            const skeleton = imageContainer.querySelector('.comparison-skeleton-loader');

            if (item.hideSkeletonTimeout) {
                clearTimeout(item.hideSkeletonTimeout);
            }


            const existingTooltip = imageContainer.querySelector('.metadata-tooltip');
            if (existingTooltip) existingTooltip.remove();
            item.metadataLoaded = false;

            img.classList.remove('loaded');

            if (skeleton) {
                skeleton.style.display = 'block';
                skeleton.style.opacity = '1';
            }
            const start = Date.now();

            const onImageLoad = () => {
                const elapsed = Date.now() - start;
                const remaining = Math.max(0, MIN_SKELETON_TIME - elapsed);

                setTimeout(() => {
                    img.classList.add('loaded');
                    item.hideSkeletonTimeout = setTimeout(() => {
                        if (skeleton) skeleton.style.display = 'none';
                    }, 200);
                    checkAllLoaded();
                }, remaining);
            };

            img.onload = onImageLoad;
            img.onerror = () => {
                if (skeleton) skeleton.style.display = 'none';
                checkAllLoaded();
            };

            const queueIndex = parseInt(item.dataset.queueIndex, 10);
            const album = queue[queueIndex];

            if (album && album.imageUrls.length > 0) {
                const imageIndexForThisAlbum = globalImageIndex % album.imageUrls.length;
                const newImageUrl = album.imageUrls[imageIndexForThisAlbum];
                img.dataset.src = newImageUrl;
                img.src = newImageUrl;
            } else {
                img.src = '';
                checkAllLoaded();
            }
        });

        updateGlobalCounter();
    }

    compareButton.addEventListener('click', () => {
        globalImageIndex = 0;
        showComparisonView();
    });
    closeComparisonButton.addEventListener('click', hideComparisonView);
    comparisonModal.addEventListener('click', (e) => {
        if (e.target === comparisonModal) {
            hideComparisonView();
        }
    });


    globalNextBtn.addEventListener('click', () => {
        updateAllComparisonImages(globalImageIndex + 1);
    });

    globalPrevBtn.addEventListener('click', () => {
        updateAllComparisonImages(globalImageIndex - 1);
    });


    const shareComparisonBtn = document.getElementById('share-comparison-btn');
    if (shareComparisonBtn) {
        shareComparisonBtn.addEventListener('click', shareComparison);
    }


    document.addEventListener('keydown', (e) => {

        const comparisonVisible = !comparisonModal.classList.contains('pointer-events-none');

        if (comparisonVisible) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (globalImageIndex > 0) {
                    updateAllComparisonImages(globalImageIndex - 1);
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (globalImageIndex < maxImagesInQueue - 1) {
                    updateAllComparisonImages(globalImageIndex + 1);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideComparisonView();
            }
        }
    });

    const menuButton = document.getElementById('menu-button');
    const closeMenuButton = document.getElementById('close-menu-button');
    const menuOverlay = document.getElementById('popup-menu-overlay');
    const popupMenuContainer = menuOverlay.querySelector('div');
    const popupMenu = document.getElementById('popup-menu');

    const settingsView = document.getElementById('settings-view');
    const settingsButton = document.getElementById('settings-button');
    const backToMenuButton = document.getElementById('back-to-menu-button');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const clearSettingsButton = document.getElementById('clear-settings-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const dbUrlInput = document.getElementById('db-url-input');
    const settingsError = document.getElementById('settings-error');

    const createAlbumView = document.getElementById('create-album-view');
    const createAlbumMenuButton = document.getElementById('create-album-menu-button');
    const backToMenuFromCreateButton = document.getElementById('back-to-menu-from-create-button');
    const submitAlbumButton = document.getElementById('submit-album-button');
    const createTitleInput = document.getElementById('create-title-input');
    const createDescInput = document.getElementById('create-desc-input');
    const createUrlsInput = document.getElementById('create-urls-input');
    const createAlbumMessage = document.getElementById('create-album-message');
    const clearAlbumFormButton = document.getElementById('clear-album-form-button');

    const openMenu = () => {
        popupMenu.classList.remove('hidden');
        settingsView.classList.add('hidden');
        createAlbumView.classList.add('hidden');

        apiKeyInput.value = localStorage.getItem('API_KEY') || '';
        dbUrlInput.value = localStorage.getItem('DB_URL') || '';
        backToMenuButton.classList.remove('hidden');
        menuOverlay.classList.remove('pointer-events-none', 'opacity-0');
        popupMenuContainer.classList.add('scale-100');
        popupMenuContainer.classList.remove('scale-95');
        menuOverlay.addEventListener('click', closeMenuByBackdrop);
    };

    const closeMenu = () => {
        menuOverlay.classList.add('opacity-0');
        setTimeout(() => menuOverlay.classList.add('pointer-events-none'), 300);
        popupMenuContainer.classList.remove('scale-100');
        popupMenuContainer.classList.add('scale-95');
    };

    const closeMenuByBackdrop = (e) => {
        if (e.target === menuOverlay) closeMenu();
    };

    const showSettingsOnboarding = () => {
        popupMenu.classList.add('hidden');
        settingsView.classList.remove('hidden');
        backToMenuButton.classList.add('hidden');
        menuOverlay.classList.remove('pointer-events-none', 'opacity-0');
        popupMenuContainer.classList.add('scale-100');
        popupMenuContainer.classList.remove('scale-95');
        menuOverlay.removeEventListener('click', closeMenuByBackdrop);
    };

    settingsButton.addEventListener('click', (e) => {
        e.preventDefault();
        popupMenu.classList.add('hidden');
        createAlbumView.classList.add('hidden');
        settingsView.classList.remove('hidden');
    });

    backToMenuButton.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        popupMenu.classList.remove('hidden');
    });

    createAlbumMenuButton.addEventListener('click', (e) => {
        e.preventDefault();
        popupMenu.classList.add('hidden');
        settingsView.classList.add('hidden');
        createAlbumView.classList.remove('hidden');
    });

    backToMenuFromCreateButton.addEventListener('click', () => {
        createAlbumView.classList.add('hidden');
        popupMenu.classList.remove('hidden');
    });

    function isValidImageUrl(url) {
        return /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
    }

    submitAlbumButton.addEventListener('click', async () => {
        const title = createTitleInput.value.trim();
        const description = createDescInput.value.trim();
        const urlsRaw = createUrlsInput.value.trim();

        createAlbumMessage.textContent = '';
        createAlbumMessage.className = 'text-sm mt-2 text-center h-4';

        if (!title) {
            createAlbumMessage.textContent = 'Title is required.';
            createAlbumMessage.classList.add('text-red-500');
            return;
        }

        const imageUrls = urlsRaw.split('\n')
            .map(url => url.trim().replace(/^http:\/\//i, 'https://'))
            .filter(url => url);

        if (imageUrls.length === 0) {
            createAlbumMessage.textContent = 'At least one image URL is required.';
            createAlbumMessage.classList.add('text-red-500');
            return;
        }

        const invalidUrls = imageUrls.filter(url => !isValidImageUrl(url));
        if (invalidUrls.length > 0) {
            createAlbumMessage.textContent = `Invalid URL format: ${invalidUrls[0]}`;
            createAlbumMessage.classList.add('text-red-500');
            return;
        }

        submitAlbumButton.disabled = true;
        submitAlbumButton.textContent = 'Creating...';

        const newAlbumData = {
            title,
            description,
            imageUrls
        };

        try {
            await apiCall(API_KEY, DB_URL, '', 'POST', newAlbumData);

            createAlbumMessage.textContent = 'Album created successfully!';
            createAlbumMessage.classList.add('text-green-500');

            createTitleInput.value = '';
            createDescInput.value = '';
            createUrlsInput.value = '';

            setTimeout(async () => {
                closeMenu();
                await fetchAndDisplayAlbums();
            }, 1500);

        } catch (error) {
            createAlbumMessage.textContent = 'Failed to create album. Check console.';
            createAlbumMessage.classList.add('text-red-500');
            console.error('Failed to create album:', error);
        } finally {
            setTimeout(() => {
                submitAlbumButton.disabled = false;
                submitAlbumButton.textContent = 'Create Album';
            }, 500);
        }
    });

    clearAlbumFormButton.addEventListener('click', () => {
        createTitleInput.value = '';
        createDescInput.value = '';
        createUrlsInput.value = '';
        createAlbumMessage.textContent = '';
        createAlbumMessage.className = 'text-sm mt-2 text-center h-4';
    });

    async function validateCredentials(key, url) {
        try {
            await apiCall(key, url, '?metafields=count', 'GET');
            return true;
        } catch (error) {
            console.warn("Validation API call threw an error, checking if it's the expected one:", error.message);
            if (error.message && error.message.includes("No sub field found")) {
                console.log("Validation successful: Received expected 'No sub field found' error.");
                return true;
            }
            console.error("Credential validation failed with an unexpected error:", error);
            return false;
        }
    }

    saveSettingsButton.addEventListener('click', async () => {
        const newApiKey = apiKeyInput.value.trim();
        const newDbUrl = dbUrlInput.value.trim();
        settingsError.textContent = '';
        saveSettingsButton.disabled = true;
        saveSettingsButton.textContent = 'Validating...';

        if (!newApiKey || !newDbUrl) {
            settingsError.textContent = 'Both fields are required.';
            saveSettingsButton.disabled = false;
            saveSettingsButton.textContent = 'Save';
            return;
        }

        const areValid = await validateCredentials(newApiKey, newDbUrl);

        if (areValid) {
            localStorage.setItem('API_KEY', newApiKey);
            localStorage.setItem('DB_URL', newDbUrl);
            API_KEY = newApiKey;
            DB_URL = newDbUrl;

            saveSettingsButton.textContent = 'Saved!';
            setTimeout(() => {
                closeMenu();
                fetchAndDisplayAlbums();
                saveSettingsButton.disabled = false;
                saveSettingsButton.textContent = 'Save';


                const pendingShare = sessionStorage.getItem('pendingSharedComparison');
                if (pendingShare) {
                    sessionStorage.removeItem('pendingSharedComparison');
                    const shareData = JSON.parse(pendingShare);

                    // Corrected line:
                    const shareUrl = `${window.location.origin}${window.location.pathname}?compare=${encodeURIComponent(btoa(JSON.stringify(shareData)))}`;
                    window.location.href = shareUrl;
                }
            }, 1000);
        } else {
            settingsError.textContent = 'Invalid credentials or network error.';
            saveSettingsButton.disabled = false;
            saveSettingsButton.textContent = 'Save';
        }
    });

    clearSettingsButton.addEventListener('click', () => {
        apiKeyInput.value = '';
        dbUrlInput.value = '';
        settingsError.textContent = '';
    });

    menuButton.addEventListener('click', openMenu);
    closeMenuButton.addEventListener('click', closeMenu);

    const detailContainer = document.getElementById('album-detail-container');
    const detailBackdrop = document.getElementById('detail-backdrop');

    let currentlyOpenCard = null;

    const closeDetailView = () => {
        if (!currentlyOpenCard) return;
        detailContainer.classList.remove('expanded');
        detailBackdrop.classList.remove('expanded');
        currentlyOpenCard.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2', 'dark:ring-offset-gray-900');
        currentlyOpenCard = null;
        detailActionButtonContainer.innerHTML = '';
    };

    function handleCardClick(card) {
        if (currentlyOpenCard === card) {
            closeDetailView();
            return;
        }
        if (currentlyOpenCard) {
            closeDetailView();
        }

        currentlyOpenCard = card;
        card.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'dark:ring-offset-gray-900');

        const title = card.dataset.title;
        const description = card.dataset.description;
        const images = JSON.parse(card.dataset.images || '[]');

        document.getElementById('detail-title').title = title;
        document.getElementById('detail-title').textContent = title;
        document.getElementById('detail-description').textContent = description;
        document.getElementById('detail-image-count').textContent = `${images.length} Image${images.length !== 1 ? 's' : ''}`;

        const gallery = document.getElementById('detail-image-gallery');
        gallery.innerHTML = '';

        const imagesToShow = images.slice(0, 3);
        imagesToShow.forEach(src => {
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'relative w-full overflow-hidden rounded-lg';
            imageWrapper.innerHTML = `
                <div class="skeleton-loader absolute inset-0"></div>
                <img data-src="${src}" class="lazy-image w-full h-full object-cover">
            `;
            gallery.appendChild(imageWrapper);
        });

        const maxGridItems = 3;
        if (imagesToShow.length < maxGridItems) {
            for (let i = 0; i < maxGridItems - imagesToShow.length; i++) {
                const placeholderWrapper = document.createElement('div');
                placeholderWrapper.className = 'relative w-full overflow-hidden rounded-lg';
                placeholderWrapper.innerHTML = `<div class="placeholder-image"></div>`;
                gallery.appendChild(placeholderWrapper);
            }
        }

        lazyLoadDetailImages();
        updateDetailActionButton();

        detailContainer.classList.add('expanded');
        detailBackdrop.classList.add('expanded');
    }

    detailBackdrop.addEventListener('click', closeDetailView);
    menuButton.addEventListener('click', closeDetailView);

    if (!API_KEY || !DB_URL) {
        showSettingsOnboarding();
    } else {
        await fetchAndDisplayAlbums();
    }

    await loadSharedComparison();
});