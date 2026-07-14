document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    const tokenInput = document.getElementById('gh-token');
    const repoInput = document.getElementById('gh-repo');
    const folderInput = document.getElementById('gh-folder');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const statusMsg = document.getElementById('status-message');
    const historyList = document.getElementById('history-list');
    const themeSelector = document.getElementById('theme-selector');

    // --- Theme Management ---
    const savedTheme = localStorage.getItem('ghTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeSelector.value = savedTheme;

    themeSelector.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        localStorage.setItem('ghTheme', e.target.value);
    });

    // --- Load Saved Credentials ---
    tokenInput.value = localStorage.getItem('ghToken') || '';
    repoInput.value = localStorage.getItem('ghRepo') || '';
    if(folderInput) folderInput.value = localStorage.getItem('ghFolder') || '';

    checkSharedFiles();

    // --- Paste from Clipboard Logic ---
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

    // --- Multiple Upload Logic ---
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

    function renderHistory() {
        historyList.innerHTML = '';
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];

        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            const isImage = item.type.startsWith('image/');
            // Replaced modal click with window.open to open in Chrome directly
            const thumb = isImage ? `<img src="${item.url}" class="history-thumb" onclick="window.open('${item.url}', '_blank')" alt="thumbnail">` : `<div class="history-thumb" onclick="window.open('${item.url}', '_blank')">File</div>`;
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

    // --- Global functions for Inline HTML attributes ---
    window.copyToClipboard = function(element) {
        element.select();
        navigator.clipboard.writeText(element.value);
        
        // Brief visual feedback
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

    // --- Retrieve Multiple Shared Files from PWA ---
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

    renderHistory();
});
