document.addEventListener('DOMContentLoaded', async () => {
    // --- API Credentials ---
    let API_KEY = localStorage.getItem('API_KEY');
    let DB_URL = localStorage.getItem('DB_URL');

    // --- Caching Album Data ---
    let albumCache = [];
    const albumsGrid = document.getElementById('albums-grid');

    // --- Queue Management ---
    let queue = [];
    const queueButton = document.getElementById('queue-button');
    const queueCount = document.getElementById('queue-count');
    const queueMenuOverlay = document.getElementById('queue-menu-overlay');
    const closeQueueMenuButton = document.getElementById('close-queue-menu-button');
    const queueList = document.getElementById('queue-list');
    const clearQueueButton = document.getElementById('clear-queue-button');
    const compareButton = document.getElementById('compare-button');
    const detailActionButtonContainer = document.getElementById('detail-action-button-container');

    // --- MODIFIED Comparison Modal ---
    const comparisonModal = document.getElementById('comparison-modal');
    const closeComparisonButton = document.getElementById('close-comparison-button');
    const comparisonGrid = document.getElementById('comparison-grid');
    const comparisonNavigation = document.getElementById('comparison-navigation');
    const globalPrevBtn = document.getElementById('global-prev-btn');
    const globalNextBtn = document.getElementById('global-next-btn');
    const globalCounterCurrent = document.getElementById('global-image-counter-current');
    const globalCounterTotal = document.getElementById('global-image-counter-total');

    // --- NEW Global State for Comparison ---
    let globalImageIndex = 0;
    let maxImagesInQueue = 0;


    /**
     * A generic function to make calls to the REST API.
     */
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

    /**
     * Creates an HTML element for a single album.
     */
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

    /**
     * Fetches albums from the API and populates the grid.
     */
    async function fetchAndDisplayAlbums() {
        albumsGrid.innerHTML = ''; // Clear previous content
        // Display skeleton loaders
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

    /**
     * Initializes all interactive logic for album cards.
     */
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

                        img.onload = () => {
                            img.classList.add('loaded');
                            const skeleton = img.previousElementSibling;
                            if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                                setTimeout(() => skeleton.remove(), 400);
                            }
                        };

                        img.src = img.dataset.src;
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


    // --- Search Logic ---
    const searchInput = document.getElementById('search-input');
    const clearSearchButton = document.getElementById('clear-search-button');
    const suggestionsBox = document.getElementById('suggestions-box');
    let selectedSuggestionIndex = -1;

    const filterAlbums = (query) => {
        query = query.toLowerCase();
        const transitionDuration = 300; // This must match the duration in your CSS

        albumCache.forEach(album => {
            const isVisible = album.title.includes(query);
            const card = album.element;
            const isHidden = card.classList.contains('hidden-by-filter');

            if (isVisible && isHidden) {
                // --- Animate IN ---
                card.style.display = '';
                setTimeout(() => {
                    card.classList.remove('hidden-by-filter');
                }, 10);

            } else if (!isVisible && !isHidden) {
                // --- Animate OUT ---
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

    // Keyboard navigation for search suggestions
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

    // --- Dedicated Lazy Loader for Detail View Images ---
    const lazyLoadDetailImages = () => {
        const detailImages = document.querySelectorAll('#detail-image-gallery .lazy-image');
        detailImages.forEach(img => {
            img.src = img.dataset.src;
            img.onload = () => {
                img.classList.add('loaded');
                const skeleton = img.previousElementSibling;
                if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                    setTimeout(() => skeleton.remove(), 400);
                }
            };
        });
    };

    // --- Dedicated Lazy Loader for Comparison View Images ---
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
                            // Handle error - still hide skeleton
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
            // Fallback for browsers without IntersectionObserver
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

    // --- Queue UI and Logic ---

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

    /**
     * Escapes HTML special characters to prevent XSS.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Extracts metadata from an image URL using exifr library.
     */
    async function extractImageMetadata(imageUrl) {
        try {
            const metadata = await exifr.parse(imageUrl, true);
            return metadata || null;
        } catch (error) {
            console.warn('Failed to extract metadata from image:', imageUrl, error);
            return null;
        }
    }

    /**
     * Parses LoRA tags from a string and formats them with colors.
     * Format: <lora:name:weight:other_params> or <lora:name>
     */
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

    /**
     * Parses checkpoint tags from a string and formats them with colors.
     * Format: <checkpoint:name>
     */
    function parseAndFormatCheckpoint(checkpointString) {
        if (!checkpointString) return 'N/A';
        
        const checkpointRegex = /<checkpoint:([^>]+)>/g;
        const match = checkpointRegex.exec(checkpointString);
        
        if (match) {
            return `<span style="color: #fbbf24; font-weight: 600;">${escapeHtml(match[1])}</span>`;
        }
        
        return escapeHtml(checkpointString);
    }

    /**
     * Formats a metadata value for display.
     */
    function formatMetadataValue(value, fieldKey) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
        
        const stringValue = String(value);
        
        // Special formatting for LoRAs
        if (fieldKey === 'user_loras') {
            return parseAndFormatLoras(stringValue);
        }
        
        // Special formatting for checkpoint
        if (fieldKey === 'user_checkpoint') {
            return parseAndFormatCheckpoint(stringValue);
        }
        
        return escapeHtml(stringValue);
    }

    /**
     * Copies text to clipboard and provides visual feedback.
     */
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

    /**
     * Creates a metadata tooltip element with the extracted metadata.
     */
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
            const value = metadata[field.key];
            if (value !== null && value !== undefined) {
                hasData = true;
                const formattedValue = formatMetadataValue(value, field.key);
                const rawValue = String(value); // Keep raw value for copying
                
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
            
            // Add click handlers for copy buttons after tooltip is created
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

    /**
     * Loads metadata for a comparison item.
     */
    async function loadMetadataForImage(imageContainer, imageUrl) {
        // Check if metadata is already loaded
        if (imageContainer.querySelector('.metadata-tooltip:not(.metadata-loading-wrapper)')) {
            return;
        }

        // Add loading indicator
        const loadingTooltip = document.createElement('div');
        loadingTooltip.className = 'metadata-tooltip metadata-loading-wrapper';
        loadingTooltip.innerHTML = `
            <div class="metadata-loading">
                <div class="metadata-spinner"></div>
                <span>Loading metadata...</span>
            </div>
        `;
        imageContainer.appendChild(loadingTooltip);

        // Extract metadata
        const metadata = await extractImageMetadata(imageUrl);
        
        // Remove loading indicator
        loadingTooltip.remove();
        
        // Add actual metadata tooltip
        const tooltip = createMetadataTooltip(metadata);
        imageContainer.appendChild(tooltip);
    }

    /**
     * REWRITTEN: Shows the comparison view with a dynamic flexbox layout.
     * Enhanced with skeleton loaders and lazy loading.
     */
    function showComparisonView() {
        if (queue.length < 2) {
            alert("Please add at least two albums to the queue to compare.");
            return;
        }

        globalImageIndex = 0; // Reset index
        maxImagesInQueue = Math.max(0, ...queue.map(album => album.imageUrls.length));
        
        // Reset loading state and navigation
        isLoadingImages = false;
        currentLoadingIndex = 0;

        // Hide navigation if no album has more than one image
        if (maxImagesInQueue <= 1) {
            comparisonNavigation.classList.add('hidden');
        } else {
            comparisonNavigation.classList.remove('hidden');
        }

        // Clear previous content and remove any old inline styles
        comparisonGrid.innerHTML = '';
        comparisonGrid.removeAttribute('style');

        queue.forEach((album, queueIndex) => {
            const item = document.createElement('div');
            item.className = 'comparison-item';
            item.dataset.queueIndex = queueIndex;

            const imageUrl = album.imageUrls.length > 0 ? album.imageUrls[0] : '';

            item.innerHTML = `
                <div class="image-container">
                    <div class="comparison-skeleton-loader"></div>
                    <img data-src="${imageUrl}" class="comparison-lazy-image" title="${album.title}">
                </div>
            `;
            comparisonGrid.appendChild(item);

            // Add hover event listener to load metadata on demand
            const imageContainer = item.querySelector('.image-container');
            item.metadataLoaded = false;
            
            item.addEventListener('mouseenter', () => {
                if (!item.metadataLoaded) {
                    const currentImg = imageContainer.querySelector('img');
                    const currentImageUrl = currentImg ? currentImg.dataset.src : '';
                    if (currentImageUrl) {
                        item.metadataLoaded = true;
                        loadMetadataForImage(imageContainer, currentImageUrl);
                    }
                }
            });
        });

        // Initialize lazy loading for comparison images
        lazyLoadComparisonImages();

        updateGlobalCounter();
        setNavigationEnabled(true); // Ensure navigation buttons are properly enabled
        comparisonModal.classList.remove('opacity-0', 'pointer-events-none');
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

    // Track current loading index to prevent mixing images from fast navigation
    let currentLoadingIndex = 0;
    let isLoadingImages = false; // Track if images are currently loading
    const minSkeletonDisplayTime = 150; // Minimum time to show skeleton (ms)

    /**
     * Disables or enables navigation buttons during image loading
     */
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

    /**
     * NEW: Updates all images in the comparison grid to a new index.
     * Enhanced to show skeleton loaders during image transitions and prevent image mixing.
     * Blocks navigation buttons during loading to prevent race conditions.
     */
    function updateAllComparisonImages(newIndex) {
        if (newIndex < 0 || newIndex >= maxImagesInQueue) {
            return; // Do nothing if index is out of bounds
        }

        // Prevent navigation if already loading
        if (isLoadingImages) {
            return;
        }

        globalImageIndex = newIndex;
        currentLoadingIndex++; // Increment to track this specific navigation request
        const thisLoadingIndex = currentLoadingIndex; // Capture the current loading index
        
        isLoadingImages = true;
        setNavigationEnabled(false); // Disable navigation buttons

        const comparisonItems = document.querySelectorAll('.comparison-item');
        let loadedCount = 0;
        const totalItems = comparisonItems.length;
        
        // Function to check if all images are loaded
        const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount >= totalItems && thisLoadingIndex === currentLoadingIndex) {
                isLoadingImages = false;
                setNavigationEnabled(true); // Re-enable navigation buttons
            }
        };
        comparisonItems.forEach(item => {
            const queueIndex = parseInt(item.dataset.queueIndex, 10);
            const album = queue[queueIndex];

            if (album.imageUrls.length > 0) {
                const imageIndexForThisAlbum = globalImageIndex % album.imageUrls.length;
                const img = item.querySelector('img');
                const imageContainer = item.querySelector('.image-container');
                
                // Remove old metadata tooltips
                const oldTooltips = imageContainer.querySelectorAll('.metadata-tooltip, .metadata-loading-wrapper');
                oldTooltips.forEach(tooltip => tooltip.remove());
                
                // Reset metadata loaded flag for this item
                item.metadataLoaded = false;
                
                // Show skeleton loader if it doesn't exist
                let skeleton = imageContainer.querySelector('.comparison-skeleton-loader');
                if (!skeleton) {
                    skeleton = document.createElement('div');
                    skeleton.className = 'comparison-skeleton-loader';
                    imageContainer.insertBefore(skeleton, img);
                }
                
                // Record when we started showing the skeleton
                const skeletonShowTime = Date.now();
                
                // Fade out current image and show skeleton immediately
                img.classList.remove('loaded');
                skeleton.style.display = 'block';
                skeleton.style.opacity = '1';
                
                // Update image source
                const newImageUrl = album.imageUrls[imageIndexForThisAlbum];
                img.dataset.src = newImageUrl;
                
                // Load new image with validation to prevent mixing
                const tempImg = new Image();
                
                const completeImageLoad = () => {
                    // Only apply the image if this is still the current navigation request
                    if (thisLoadingIndex !== currentLoadingIndex) {
                        checkAllLoaded(); // Still count as loaded even if aborted
                        return; // Abort if a newer request has been made
                    }
                    
                    // Calculate how long the skeleton has been visible
                    const skeletonDisplayDuration = Date.now() - skeletonShowTime;
                    const remainingTime = Math.max(0, minSkeletonDisplayTime - skeletonDisplayDuration);
                    
                    // Ensure skeleton shows for minimum time to prevent flickering
                    setTimeout(() => {
                        if (thisLoadingIndex === currentLoadingIndex) {
                            img.src = newImageUrl;
                            
                            // Wait a tiny bit for the image to actually render
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    if (thisLoadingIndex === currentLoadingIndex) {
                                        img.classList.add('loaded');
                                        
                                        // Hide skeleton after fade-in completes
                                        setTimeout(() => {
                                            if (skeleton && thisLoadingIndex === currentLoadingIndex) {
                                                skeleton.style.display = 'none';
                                            }
                                            checkAllLoaded(); // Mark this item as loaded
                                        }, 400);
                                    } else {
                                        checkAllLoaded(); // Mark as loaded even if request changed
                                    }
                                });
                            });
                        } else {
                            checkAllLoaded(); // Mark as loaded even if request changed
                        }
                    }, remainingTime);
                };
                
                tempImg.onload = completeImageLoad;
                tempImg.onerror = () => {
                    // Hide skeleton even on error, but only if this is the current request
                    if (thisLoadingIndex === currentLoadingIndex) {
                        const skeletonDisplayDuration = Date.now() - skeletonShowTime;
                        const remainingTime = Math.max(0, minSkeletonDisplayTime - skeletonDisplayDuration);
                        
                        setTimeout(() => {
                            if (thisLoadingIndex === currentLoadingIndex) {
                                img.classList.add('loaded');
                                if (skeleton) {
                                    skeleton.style.display = 'none';
                                }
                            }
                            checkAllLoaded(); // Mark as loaded even on error
                        }, remainingTime);
                    } else {
                        checkAllLoaded(); // Mark as loaded even if request changed
                    }
                };
                
                tempImg.src = newImageUrl;
            }
        });

        updateGlobalCounter();
    }

    // --- MODIFIED Event Listeners for Comparison Modal ---
    compareButton.addEventListener('click', showComparisonView);
    closeComparisonButton.addEventListener('click', hideComparisonView);
    comparisonModal.addEventListener('click', (e) => {
        if (e.target === comparisonModal) {
            hideComparisonView();
        }
    });

    // NEW event listeners for global navigation
    globalNextBtn.addEventListener('click', () => {
        updateAllComparisonImages(globalImageIndex + 1);
    });

    globalPrevBtn.addEventListener('click', () => {
        updateAllComparisonImages(globalImageIndex - 1);
    });

    // Keyboard navigation for Comparison Viewer
    document.addEventListener('keydown', (e) => {
        // Only handle keyboard events when comparison modal is visible
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

    // --- Popup Menu & Settings Logic ---
    const menuButton = document.getElementById('menu-button');
    const closeMenuButton = document.getElementById('close-menu-button');
    const menuOverlay = document.getElementById('popup-menu-overlay');
    const popupMenuContainer = menuOverlay.querySelector('div');
    const popupMenu = document.getElementById('popup-menu');

    // Settings View Elements
    const settingsView = document.getElementById('settings-view');
    const settingsButton = document.getElementById('settings-button');
    const backToMenuButton = document.getElementById('back-to-menu-button');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const clearSettingsButton = document.getElementById('clear-settings-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const dbUrlInput = document.getElementById('db-url-input');
    const settingsError = document.getElementById('settings-error');

    // Create Album View Elements
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

    // --- Expandable Album Detail Logic ---
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

    // --- Initial Load ---
    if (!API_KEY || !DB_URL) {
        showSettingsOnboarding();
    } else {
        await fetchAndDisplayAlbums();
    }
});