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

// click handlers
uploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});
uploadZone.addEventListener('click', () => fileInput.click());

// drag and drop handlers
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

// file size/count managers
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

// update file list
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

// remove file
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    updateGenerateButton();
}

// toggle gen button
function updateGenerateButton() {
    if (selectedFiles.length > 0) {
        generateBtn.classList.add('active');
    }
}

// file icon from extension
function getFileIcon(fileType) {
    if (fileType.includes('pdf')) return 'fas fa-file-pdf';
    if (fileType.includes('image')) return 'fas fa-image';
    if (fileType.includes('word') || fileType.includes('document')) return 'fas fa-file-word';
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'fas fa-file-powerpoint';
    if (fileType.includes('text')) return 'fas fa-file-alt';
    return 'fas fa-file';
}

// file size formatter
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// smooth scrolling for navigation links
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