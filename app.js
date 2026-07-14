document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    const tokenInput = document.getElementById('gh-token');
    const repoInput = document.getElementById('gh-repo');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const statusMsg = document.getElementById('status-message');
    const historyList = document.getElementById('history-list');

    // Load saved credentials
    tokenInput.value = localStorage.getItem('ghToken') || '';
    repoInput.value = localStorage.getItem('ghRepo') || '';

    // Check if opened from Android Share Sheet
    checkSharedFile();

    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return alert('Please select a file.');

        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        
        if (!token || !repo) return alert('Token and Repo are required.');

        // Save credentials for next time
        localStorage.setItem('ghToken', token);
        localStorage.setItem('ghRepo', repo);

        statusMsg.innerText = 'Uploading...';
        uploadBtn.disabled = true;

        try {
            const base64Data = await toBase64(file);
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const path = `uploads/${fileName}`;

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
                statusMsg.innerText = 'Upload successful!';
                saveToHistory(data.content.download_url, file.type);
                renderHistory();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            statusMsg.innerText = `Error: ${error.message}`;
        } finally {
            uploadBtn.disabled = false;
        }
    });

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove the data:image/png;base64, prefix for GitHub API
                const b64 = reader.result.split(',')[1];
                resolve(b64);
            };
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

        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            const isImage = item.type.startsWith('image/');
            const thumb = isImage ? `<img src="${item.url}" class="history-thumb" onclick="openPreview('${item.url}')" alt="thumbnail">` : `<div class="history-thumb">File</div>`;
            const markdownCode = isImage ? `![Image](${item.url})` : `[File](${item.url})`;

            div.innerHTML = `
                ${thumb}
                <div class="history-details">
                    <label>Direct Link:</label>
                    <input type="text" value="${item.url}" readonly onclick="this.select()">
                    <label>Markdown:</label>
                    <input type="text" value="${markdownCode}" readonly onclick="this.select()">
                </div>
            `;
            historyList.appendChild(div);
        });
    }

    // Modal Logic
    window.openPreview = function(url) {
        const modal = document.getElementById('preview-modal');
        const modalImg = document.getElementById('modal-image');
        modal.style.display = "block";
        modalImg.src = url;
    }

    document.querySelector('.close-modal').onclick = function() {
        document.getElementById('preview-modal').style.display = "none";
    }

    // PWA Share Sheet Logic: Retrieve file cached by sw.js
    async function checkSharedFile() {
        if ('caches' in window) {
            const cache = await caches.open('shared-files');
            const response = await cache.match('/shared-file');
            if (response) {
                const blob = await response.blob();
                const file = new File([blob], "shared_upload", { type: blob.type });
                
                // Create a DataTransfer object to assign the file to the input element
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                
                statusMsg.innerText = 'Shared file ready to upload!';
                await cache.delete('/shared-file');
            }
        }
    }

    // Initial render
    renderHistory();
});
