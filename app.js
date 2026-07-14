document.addEventListener('DOMContentLoaded', () => {
    // 1. Service Worker Registration (Using relative path for GitHub Pages)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js');
    }

    // 2. DOM Elements
    const tokenInput = document.getElementById('gh-token');
    const repoInput = document.getElementById('gh-repo');
    const folderInput = document.getElementById('gh-folder');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const statusMsg = document.getElementById('status-message');
    const historyList = document.getElementById('history-list');
    const themeSelector = document.getElementById('theme-selector');

    // 3. Theme Management
    const savedTheme = localStorage.getItem('ghTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if(themeSelector) themeSelector.value = savedTheme;

    if(themeSelector) {
        themeSelector.addEventListener('change', (e) => {
            document.documentElement.setAttribute('data-theme', e.target.value);
            localStorage.setItem('ghTheme', e.target.value);
        });
    }

    // 4. Load Saved Credentials
    tokenInput.value = localStorage.getItem('ghToken') || '';
    repoInput.value = localStorage.getItem('ghRepo') || '';
    if(folderInput) folderInput.value = localStorage.getItem('ghFolder') || '';

    // Check for files shared via Android Share Sheet
    checkSharedFiles();

    // 5. Paste from Clipboard Logic
    if(pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const clipboardItems = await navigator.clipboard.read();
                const dataTransfer = new DataTransfer();
                
                for (const item of clipboardItems) {
                    const imageTypes = item.types.filter(type => type.startsWith('image/'));
                    for (const type of imageTypes) {
                        const blob = await item.getType(type);
                        const file = new File([blob], `pasted_${Date.now()}.${type.split('/')[1]}`, { type });
                        dataTransfer.items.add(file);
                    }
                }

                if (dataTransfer.files.length > 0) {
                    fileInput.files = dataTransfer.files;
                    statusMsg.innerText = `${dataTransfer.files.length} image(s) pasted!`;
                } else {
                    alert('No image found in clipboard.');
                }
            } catch (err) {
                console.error('Failed to read clipboard', err);
                alert('Clipboard access denied or empty.');
            }
        });
    }

    // 6. Multiple Upload Logic
    uploadBtn.addEventListener('click', async () => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) return alert('Please select a file.');

        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        const folder = folderInput ? folderInput.value.trim() : '';
        
        if (!token || !repo) return alert('Token and Repo are required.');

        localStorage.setItem('ghToken', token);
        localStorage.setItem('ghRepo', repo);
        if(folderInput) localStorage.setItem('ghFolder', folder);

        uploadBtn.disabled = true;
        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            statusMsg.innerText = `Uploading ${i + 1} of ${files.length}...`;
            
            try {
                const base64Data = await toBase64(file);
                const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                const path = folder ? `${folder}/${fileName}` : fileName;

                const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Upload ${fileName}`,
                        content: base64Data
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    successCount++;
                    saveToHistory(data.content.download_url, file.type);
                } else {
                    console.error(`Error uploading ${file.name}:`, data.message);
                }
            } catch (error) {
                console.error(`Catch error on ${file.name}:`, error);
            }
        }

        statusMsg.innerText = `Successfully uploaded ${successCount} out of ${files.length} files.`;
        uploadBtn.disabled = false;
        fileInput.value = ''; // clear input
        renderHistory();
    });

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    function saveToHistory(url, type) {
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];
        history.unshift({ url, type, date: new Date().toLocaleString() });
        localStorage.setItem('ghHistory', JSON.stringify(history));
    }

    // 7. Render History List
    function renderHistory() {
        historyList.innerHTML = '';
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];

        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            // Safely check type in case older history items don't have it
            const itemType = item.type || 'unknown'; 
            const isImage = itemType.startsWith('image/');
            
            const thumb = isImage 
                ? `<img src="${item.url}" class="history-thumb" onclick="openPreview('${item.url}', '${itemType}')" alt="thumbnail">` 
                : `<div class="history-thumb" onclick="openPreview('${item.url}', '${itemType}')">${itemType.split('/')[0].toUpperCase() || 'FILE'}</div>`;
            
            const markdownCode = isImage ? `![Image](${item.url})` : `[File](${item.url})`;

            div.innerHTML = `
                ${thumb}
                <div class="history-details">
                    <label>Direct Link: (Tap to copy)</label>
                    <input type="text" value="${item.url}" readonly onclick="copyToClipboard(this)">
                    <label>Markdown: (Tap to copy)</label>
                    <input type="text" value="${markdownCode}" readonly onclick="copyToClipboard(this)">
                    <button class="delete-btn" onclick="deleteHistoryItem(${index})">Delete from History</button>
                </div>
            `;
            historyList.appendChild(div);
        });
    }

    // 8. Global Functions (Clipboard & Delete)
    window.copyToClipboard = function(element) {
        element.select();
        navigator.clipboard.writeText(element.value);
        
        const originalBg = element.style.backgroundColor;
        element.style.backgroundColor = '#2ea44f';
        element.style.color = '#fff';
        setTimeout(() => {
            element.style.backgroundColor = originalBg;
            element.style.color = '';
        }, 300);
    }

    window.deleteHistoryItem = function(index) {
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];
        history.splice(index, 1);
        localStorage.setItem('ghHistory', JSON.stringify(history));
        renderHistory();
    }

    // 9. Bulletproof Preview Modal Logic
    window.openPreview = function(url, type) {
        const modal = document.getElementById('preview-modal');
        let container = document.getElementById('modal-content-container');
        
        // Fallback for legacy items without a type
        if (!type || type === 'undefined' || type === 'unknown') {
            type = 'image/png'; 
        }

        // Auto-fix if cached HTML is still using the old modal structure
        if (!container) {
            const oldImg = document.getElementById('modal-image');
            if (oldImg) {
                oldImg.outerHTML = '<div id="modal-content-container" class="modal-content"></div>';
                container = document.getElementById('modal-content-container');
            } else {
                return alert("Modal container not found. Please clear cache and reload.");
            }
        }

        container.innerHTML = ''; // Clear previous content

        // Inject media with explicit inline styles to force correct sizing
        if (type.startsWith('image/')) {
            container.innerHTML = `<img src="${url}" alt="Preview" style="max-width: 90vw; max-height: 80vh; object-fit: contain; display: block; margin: auto;">`;
        } else if (type.startsWith('video/')) {
            container.innerHTML = `<video controls autoplay name="media" style="max-width: 90vw; max-height: 80vh; margin: auto; display: block;"><source src="${url}" type="${type}"></video>`;
        } else if (type.startsWith('audio/')) {
            container.innerHTML = `<audio controls autoplay name="media" style="width: 80vw; margin: auto; display: block;"><source src="${url}" type="${type}"></audio>`;
        } else {
            // Fallback for ZIPs, PDFs, etc.
            window.open(url, '_blank');
            return; 
        }

        // Force Flexbox centering directly on the modal element to override any CSS mismatches
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        
        const closeBtn = document.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.style.position = "absolute";
            closeBtn.style.top = "15px";
            closeBtn.style.right = "25px";
            closeBtn.style.zIndex = "1001";
        }
    }

    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.onclick = function() {
            const modal = document.getElementById('preview-modal');
            const container = document.getElementById('modal-content-container');
            
            modal.style.display = "none";
            if (container) container.innerHTML = ''; // Stops audio/video playback
        }
    }

    // 10. Retrieve Multiple Shared Files from PWA Cache
    async function checkSharedFiles() {
        if ('caches' in window) {
            const cache = await caches.open('shared-files');
            const countRes = await cache.match('/shared-file-count');
            
            if (countRes) {
                const count = parseInt(await countRes.text());
                const dataTransfer = new DataTransfer();
                
                for (let i = 0; i < count; i++) {
                    const res = await cache.match(`/shared-file-${i}`);
                    if (res) {
                        const blob = await res.blob();
                        const file = new File([blob], `shared_upload_${i}_${Date.now()}`, { type: blob.type });
                        dataTransfer.items.add(file);
                        await cache.delete(`/shared-file-${i}`);
                    }
                }
                
                await cache.delete('/shared-file-count');
                if (dataTransfer.files.length > 0) {
                    fileInput.files = dataTransfer.files;
                    statusMsg.innerText = `${dataTransfer.files.length} shared file(s) ready to upload!`;
                }
            }
        }
    }

    // Initial render
    renderHistory();
});
