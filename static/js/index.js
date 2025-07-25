// File upload functionality (no actual functionality, just UI interactions)
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const fileList = document.getElementById('fileList');
const generateBtn = document.getElementById('generateBtn');
const processing = document.getElementById('processing');

let selectedFiles = [];
const maxFiles = 5;
const maxSize = 10 * 1024 * 1024; // 10MB

// Click handlers
uploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});
uploadZone.addEventListener('click', () => fileInput.click());

// Drag and drop handlers
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    for (let file of files) {
        if (selectedFiles.length >= maxFiles) {
            alert(`Maximum ${maxFiles} files allowed`);
            break;
        }

        if (file.size > maxSize) {
            alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
            continue;
        }

        if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            continue;
        }

        selectedFiles.push(file);
    }

    updateFileList();
    updateGenerateButton();
}

function updateFileList() {
    fileList.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const fileIcon = getFileIcon(file.type);
        const fileSize = formatFileSize(file.size);

        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="${fileIcon}"></i>
                </div>
                <div class="file-details">
                    <h4>${file.name}</h4>
                    <p>${fileSize}</p>
                </div>
            </div>
            <button class="remove-btn add-font" onclick="removeFile(${index})">
                Remove
            </button>
        `;

        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    updateGenerateButton();
}

function updateGenerateButton() {
    if (selectedFiles.length > 0) {
        generateBtn.classList.add('active');
    } else {
        generateBtn.classList.remove('active');
    }
}

function getFileIcon(fileType) {
    if (fileType.includes('pdf')) return 'fas fa-file-pdf';
    if (fileType.includes('image')) return 'fas fa-image';
    if (fileType.includes('word') || fileType.includes('document')) return 'fas fa-file-word';
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'fas fa-file-powerpoint';
    if (fileType.includes('text')) return 'fas fa-file-alt';
    return 'fas fa-file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Send files to backend
// generateBtn.addEventListener('click', async () => {
//     if (selectedFiles.length === 0) {
//         alert("You need to add files first!");
//         return;
//     }
//     processing.style.display = 'block';
//
//     // Prepare FormData
//     const formData = new FormData();
//     selectedFiles.forEach((file, idx) => {
//         formData.append('files', file); // 'files' is the key for all files
//     });
//
//     try {
//         const response = await fetch('/generate', {
//             method: 'POST',
//             body: formData,
//         });
//
//         if (!response.ok) {
//             throw new Error('Network response was not ok');
//         }
//
//         const data = await response.json();
//         console.log('Response:', data);
//
//         // handle success (e.g., show generated quiz or message)
//     } catch (error) {
//         console.error('Error:', error);
//         alert('Failed to generate quiz.');
//     } finally {
//         processing.style.display = 'none';
//         uploadBtn.disabled = false;
//         fileInput.disabled = false;
//         uploadZone.style.pointerEvents = 'auto';
//     }
// });
