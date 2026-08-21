let currentEditingFile = null;
let currentEditingCard = null;

// --- GALLERY SETUP FOR TESTING ---
document.getElementById('uploadInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => addImageToGallery(file));
    e.target.value = ''; 
});

function addImageToGallery(file) {
    const gallery = document.getElementById('imageGallery');
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.filename = file.name;

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    
    const title = document.createElement('p');
    title.innerHTML = `<strong>${file.name}</strong><br>${(file.size / 1024).toFixed(1)} KB`;

    const compressBtn = document.createElement('button');
    compressBtn.innerText = 'Compress';
    compressBtn.onclick = () => openCompressModal(file, card);

    const editBtn = document.createElement('button');
    editBtn.innerText = 'Edit (External)';
    editBtn.onclick = () => triggerEditReplace(file, card);

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(compressBtn);
    card.appendChild(editBtn);
    gallery.appendChild(card);
}

// --- COMPRESS WORKFLOW ---
function openCompressModal(file, cardElement) {
    currentEditingFile = file;
    currentEditingCard = cardElement;
    const modal = document.getElementById('compressModal');
    const overlay = document.getElementById('modalOverlay');
    const slider = document.getElementById('qualitySlider');
    const display = document.getElementById('qualityDisplay');
    
    slider.oninput = () => { display.innerText = `${Math.round(slider.value * 100)}%`; };
    modal.style.display = 'block';
    overlay.style.display = 'block';

    document.getElementById('applyCompressBtn').onclick = () => {
        compressAndReplace(currentEditingFile, parseFloat(slider.value));
        closeModal();
    };
}

function closeModal() {
    document.getElementById('compressModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
}

function compressAndReplace(file, quality) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                const newFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                updateRepositoryFile(newFile, currentEditingCard);
            }, 'image/jpeg', quality);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// --- EDIT WORKFLOW ---
function triggerEditReplace(file, cardElement) {
    currentEditingFile = file;
    currentEditingCard = cardElement;
    
    // Trigger local download
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Open picker to upload the edited version
    const fileInput = document.getElementById('editFileInput');
    fileInput.onchange = (e) => {
        const uploadedFile = e.target.files[0];
        if (uploadedFile) {
            const replacedFile = new File([uploadedFile], currentEditingFile.name, {
                type: uploadedFile.type,
                lastModified: Date.now()
            });
            updateRepositoryFile(replacedFile, currentEditingCard);
        }
        fileInput.value = ''; 
    };
    
    // Slight timeout ensures download prompt fires before upload prompt
    setTimeout(() => { fileInput.click(); }, 300);
}

// --- UI REFRESH WORKFLOW ---
function updateRepositoryFile(newFile, cardElement) {
    const imgElement = cardElement.querySelector('img');
    const titleElement = cardElement.querySelector('p');
    const buttons = cardElement.querySelectorAll('button');
    
    // Release old memory
    URL.revokeObjectURL(imgElement.src);
    
    imgElement.src = URL.createObjectURL(newFile);
    titleElement.innerHTML = `<strong>${newFile.name}</strong><br>${(newFile.size / 1024).toFixed(1)} KB <span style="color: green;">(Updated)</span>`;
    
    buttons[0].onclick = () => openCompressModal(newFile, cardElement);
    buttons[1].onclick = () => triggerEditReplace(newFile, cardElement);
}

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered successfully with scope: ', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed: ', error);
            });
    });
}
