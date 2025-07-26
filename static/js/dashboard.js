// Fixed Dashboard functionality with API integration
class Dashboard {
    constructor() {
        this.currentProject = null;
        this.projects = [];
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.selectedFiles = [];
        this.maxFiles = 10;
        this.maxSize = 25 * 1024 * 1024; // 25MB
        this.apiBase = '/api'; // Your Flask API base URL

        this.init();
    }

    init() {
        this.loadUserData();
        this.bindEvents();
    }

    // ==============================
    // API UTILITY METHODS
    // ==============================

    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                credentials: 'include', // Include session cookies
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API request failed');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            this.hideLoading();
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    async uploadFiles(projectId, files) {
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const response = await fetch(`${this.apiBase}/projects/${projectId}/files/upload`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Upload failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Upload Error:', error);
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    // ==============================
    // DATA LOADING METHODS
    // ==============================

    async loadUserData() {
        try {
            this.showLoading('Loading dashboard...');

            // Load projects and stats in parallel
            const [projectsData, statsData] = await Promise.all([
                this.apiCall('/projects'),
                this.apiCall('/dashboard/stats')
            ]);

            this.projects = projectsData.projects || [];
            this.renderProjects();
            this.updateStatsFromAPI(statsData);

            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to load dashboard data', 'error');
        }
    }

    async loadProject(projectId) {
        try {
            const project = await this.apiCall(`/projects/${projectId}`);
            return project;
        } catch (error) {
            this.showNotification('Failed to load project', 'error');
            return null;
        }
    }

    // ==============================
    // PROJECT METHODS
    // ==============================

    async createNewProject() {
        const projectName = document.getElementById('projectName').value;
        const projectDesc = document.getElementById('projectDesc').value;

        if (!projectName.trim()) {
            this.showNotification('Please enter a project name', 'warning');
            return;
        }

        try {
            this.showLoading('Creating project...');

            const newProject = await this.apiCall('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    description: projectDesc
                })
            });

            // Add to local projects array
            this.projects.push(newProject);
            this.renderProjects();

            // Close modal and reset form
            document.getElementById('newProjectModal').classList.remove('active');
            document.getElementById('newProjectForm').reset();

            this.hideLoading();
            this.showNotification('Project created successfully!', 'success');

            // Refresh stats
            this.refreshStats();

        } catch (error) {
            this.hideLoading();
        }
    }

    async openProject(projectId) {
        try {
            this.showLoading('Loading project...');

            const project = await this.loadProject(projectId);
            if (!project) return;

            this.currentProject = project;

            // Update modal title and form
            document.getElementById('projectTitle').textContent = project.name;
            document.getElementById('editProjectName').value = project.name;
            document.getElementById('editProjectDesc').value = project.description || '';

            // Show modal and switch to files tab
            document.getElementById('projectModal').classList.add('active');
            this.switchTab('files');

            // Render project content
            this.renderProjectFiles();
            this.renderProjectQuizzes();

            this.hideLoading();

        } catch (error) {
            this.hideLoading();
        }
    }

    async updateProject() {
        if (!this.currentProject) return;

        const name = document.getElementById('editProjectName').value;
        const description = document.getElementById('editProjectDesc').value;

        try {
            const updatedProject = await this.apiCall(`/projects/${this.currentProject.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name, description })
            });

            // Update local data
            const projectIndex = this.projects.findIndex(p => p.id === this.currentProject.id);
            if (projectIndex !== -1) {
                this.projects[projectIndex] = { ...this.projects[projectIndex], ...updatedProject };
            }

            this.currentProject = { ...this.currentProject, ...updatedProject };
            this.renderProjects();
            this.showNotification('Project updated successfully!', 'success');

        } catch (error) {
            // Error already handled in apiCall
        }
    }

    async deleteProject() {
        if (!this.currentProject) return;

        const projectName = this.currentProject.name;
        if (!confirm(`Are you sure you want to delete "${projectName}"? This will delete all files and quizzes. This action cannot be undone.`)) {
            return;
        }

        try {
            this.showLoading('Deleting project...');

            await this.apiCall(`/projects/${this.currentProject.id}`, {
                method: 'DELETE'
            });

            // Remove from local data
            this.projects = this.projects.filter(p => p.id !== this.currentProject.id);

            // Close modal
            document.getElementById('projectModal').classList.remove('active');

            this.renderProjects();
            this.refreshStats();
            this.showNotification(`Project "${projectName}" deleted successfully!`, 'success');

            this.currentProject = null;
            this.hideLoading();

        } catch (error) {
            this.hideLoading();
        }
    }

    // ==============================
    // FILE METHODS
    // ==============================

    async handleModalFiles(files) {
        if (!this.currentProject) {
            this.showNotification('Please select a project first', 'warning');
            return;
        }

        // Validate files
        const validFiles = [];
        Array.from(files).forEach(file => {
            if (validFiles.length >= this.maxFiles) {
                this.showNotification(`Maximum ${this.maxFiles} files allowed`, 'warning');
                return;
            }

            if (file.size > this.maxSize) {
                this.showNotification(`File ${file.name} is too large (max 25MB)`, 'warning');
                return;
            }

            validFiles.push(file);
        });

        if (validFiles.length === 0) return;

        try {
            this.showLoading('Uploading files...');

            const result = await this.uploadFiles(this.currentProject.id, validFiles);

            this.hideLoading();

            if (result.uploaded_files.length > 0) {
                this.showNotification(`${result.uploaded_files.length} files uploaded successfully!`, 'success');

                // Refresh project data
                await this.refreshCurrentProject();
            }

            if (result.failed_files.length > 0) {
                this.showNotification(`${result.failed_files.length} files failed to upload`, 'warning');
            }

        } catch (error) {
            this.hideLoading();
        }
    }

    async refreshCurrentProject() {
        if (!this.currentProject) return;

        try {
            const updatedProject = await this.loadProject(this.currentProject.id);
            if (updatedProject) {
                this.currentProject = updatedProject;
                this.renderProjectFiles();

                // Update projects list
                const projectIndex = this.projects.findIndex(p => p.id === this.currentProject.id);
                if (projectIndex !== -1) {
                    this.projects[projectIndex] = {
                        ...this.projects[projectIndex],
                        file_count: updatedProject.files?.length || 0,
                        quiz_count: updatedProject.quizzes?.length || 0
                    };
                }
                this.renderProjects();
            }
        } catch (error) {
            // Error already handled
        }
    }

    async removeFile(fileId, isSelected = false) {
        if (isSelected) {
            // Handle selected files (before upload)
            this.selectedFiles = this.selectedFiles.filter(f => f.id !== fileId);
            this.renderSelectedFiles();
            return;
        }

        if (!confirm('Are you sure you want to delete this file?')) return;

        try {
            await this.apiCall(`/files/${fileId}`, {
                method: 'DELETE'
            });

            this.showNotification('File deleted successfully!', 'success');
            await this.refreshCurrentProject();

        } catch (error) {
            // Error already handled
        }
    }

    renderProjectFiles() {
        if (!this.currentProject) return;

        const fileList = document.getElementById('modalFileList');
        if (!fileList) return;

        fileList.innerHTML = '';

        if (this.currentProject.files && this.currentProject.files.length > 0) {
            this.currentProject.files.forEach((file, index) => {
                const fileItem = this.createFileItem(file, file.id, false);
                fileList.appendChild(fileItem);
            });
        } else {
            fileList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No files uploaded yet</p>';
        }
    }

    // ==============================
    // QUIZ METHODS
    // ==============================

    async generateQuiz() {
        if (!this.currentProject || !this.currentProject.files || this.currentProject.files.length === 0) {
            this.showNotification('Please add files to the project first', 'warning');
            return;
        }

        const difficulty = document.getElementById('difficulty').value;
        const questionCount = parseInt(document.getElementById('questionCount').value);
        const questionTypes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        if (questionTypes.length === 0) {
            this.showNotification('Please select at least one question type', 'warning');
            return;
        }

        try {
            this.showLoading('Generating quiz with AI...');

            const result = await this.apiCall(`/projects/${this.currentProject.id}/quizzes/generate`, {
                method: 'POST',
                body: JSON.stringify({
                    title: `${this.currentProject.name} Quiz`,
                    difficulty: difficulty,
                    question_count: questionCount,
                    question_types: questionTypes
                })
            });

            this.hideLoading();
            this.showNotification('Quiz generated successfully!', 'success');

            // Refresh project data to show new quiz
            await this.refreshCurrentProject();
            this.renderProjectQuizzes();

        } catch (error) {
            this.hideLoading();
        }
    }

    async takeQuiz(quizId) {
        try {
            this.showLoading('Loading quiz...');

            const quiz = await this.apiCall(`/quizzes/${quizId}`);

            this.currentQuiz = quiz;
            this.currentQuestionIndex = 0;
            this.userAnswers = new Array(quiz.questions.length).fill(null);

            // Show quiz modal
            document.getElementById('quizTakingModal').classList.add('active');
            document.getElementById('quizTakingTitle').textContent = quiz.title;

            this.renderCurrentQuestion();
            this.updateQuizProgress();
            this.hideLoading();

        } catch (error) {
            this.hideLoading();
        }
    }

    async submitQuiz() {
        if (!this.currentQuiz) return;

        try {
            this.showLoading('Submitting quiz...');

            // Prepare answers in the format expected by API
            const answers = [];
            this.currentQuiz.questions.forEach((question, index) => {
                if (this.userAnswers[index] !== null) {
                    answers.push({
                        question_id: question.id,
                        selected_option: this.userAnswers[index]
                    });
                }
            });

            const result = await this.apiCall(`/quizzes/${this.currentQuiz.id}/submit`, {
                method: 'POST',
                body: JSON.stringify({ answers })
            });

            this.hideLoading();
            this.showQuizResults(result.score, result.correct_answers, result.results);

            // Refresh stats
            this.refreshStats();

        } catch (error) {
            this.hideLoading();
        }
    }

    async deleteQuiz(quizId) {
        if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
            return;
        }

        try {
            await this.apiCall(`/quizzes/${quizId}`, {
                method: 'DELETE'
            });

            this.showNotification('Quiz deleted successfully!', 'success');
            await this.refreshCurrentProject();
            this.renderProjectQuizzes();

        } catch (error) {
            // Error already handled
        }
    }

    async downloadQuiz(quizId) {
        try {
            this.showLoading('Generating PDF...');

            // For now, we'll create a simple text download
            // In production, your Flask endpoint would return a PDF
            const quiz = await this.apiCall(`/quizzes/${quizId}`);

            let content = `${quiz.title}\n`;
            content += `Difficulty: ${quiz.difficulty}\n`;
            content += `Questions: ${quiz.questions.length}\n\n`;

            quiz.questions.forEach((question, index) => {
                content += `${index + 1}. ${question.text}\n`;
                if (question.options) {
                    question.options.forEach((option, optIndex) => {
                        content += `   ${String.fromCharCode(65 + optIndex)}. ${option}\n`;
                    });
                    if (question.correct_answer !== undefined) {
                        content += `   Answer: ${String.fromCharCode(65 + question.correct_answer)}\n`;
                    }
                }
                content += '\n';
            });

            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${quiz.title.replace(/\s+/g, '_')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('Quiz downloaded successfully!', 'success');

        } catch (error) {
            this.hideLoading();
        }
    }

    renderProjectQuizzes() {
        if (!this.currentProject) return;

        const quizList = document.getElementById('quizList');
        if (!quizList) return;

        quizList.innerHTML = '';

        if (this.currentProject.quizzes && this.currentProject.quizzes.length > 0) {
            this.currentProject.quizzes.forEach(quiz => {
                const quizItem = this.createQuizItem(quiz);
                quizList.appendChild(quizItem);
            });
        } else {
            quizList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No quizzes generated yet</p>';
        }
    }

    // ==============================
    // QUICK QUIZ METHOD
    // ==============================

    async quickQuiz(projectId) {
        try {
            const project = await this.loadProject(projectId);
            if (!project || !project.quizzes || project.quizzes.length === 0) {
                this.showNotification('No quizzes available for this project', 'warning');
                return;
            }

            // Take the most recent quiz
            const latestQuiz = project.quizzes[project.quizzes.length - 1];
            this.currentProject = project;
            await this.takeQuiz(latestQuiz.id);

        } catch (error) {
            // Error already handled
        }
    }

    // ==============================
    // STATS AND UI METHODS
    // ==============================

    updateStatsFromAPI(statsData) {
        const statCards = document.querySelectorAll('.stat-card .stat-content h3');
        if (statCards.length >= 4) {
            statCards[0].textContent = statsData.total_projects || 0;
            statCards[1].textContent = statsData.total_quizzes || 0;
            statCards[2].textContent = `${statsData.average_score || 0}%`;
            statCards[3].textContent = `${Math.round(statsData.total_attempts / 24) || 0}h`; // Rough estimate
        }
    }

    async refreshStats() {
        try {
            const statsData = await this.apiCall('/dashboard/stats');
            this.updateStatsFromAPI(statsData);
        } catch (error) {
            // Error already handled
        }
    }

    // ==============================
    // EVENT BINDING METHODS
    // ==============================

    bindEvents() {
        // User menu toggle
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');

        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('active');
            });

            document.addEventListener('click', () => {
                userDropdown.classList.remove('active');
            });
        }

        // New project modal
        const newProjectBtn = document.getElementById('newProjectBtn');
        const newProjectModal = document.getElementById('newProjectModal');
        const closeModal = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelBtn');
        const newProjectForm = document.getElementById('newProjectForm');

        if (newProjectBtn && newProjectModal) {
            newProjectBtn.addEventListener('click', () => {
                newProjectModal.classList.add('active');
            });
        }

        if (closeModal && newProjectModal) {
            closeModal.addEventListener('click', () => {
                newProjectModal.classList.remove('active');
            });
        }

        if (cancelBtn && newProjectModal) {
            cancelBtn.addEventListener('click', () => {
                newProjectModal.classList.remove('active');
            });
        }

        if (newProjectForm) {
            newProjectForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createNewProject();
            });
        }

        // Project modal events
        this.bindProjectModalEvents();

        // Quiz modal events
        this.bindQuizModalEvents();

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });
    }

    bindProjectModalEvents() {
        const projectModal = document.getElementById('projectModal');
        const closeProjectModal = document.getElementById('closeProjectModal');

        if (closeProjectModal && projectModal) {
            closeProjectModal.addEventListener('click', () => {
                projectModal.classList.remove('active');
            });
        }

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Modal file upload
        this.bindModalFileUpload();

        // Quiz generation
        const generateQuizBtn = document.getElementById('generateQuizBtn');
        if (generateQuizBtn) {
            generateQuizBtn.addEventListener('click', () => {
                this.generateQuiz();
            });
        }

        // Delete project
        const deleteProjectBtn = document.getElementById('deleteProjectBtn');
        if (deleteProjectBtn) {
            deleteProjectBtn.addEventListener('click', () => {
                this.deleteProject();
            });
        }

        // Update project
        const updateProjectBtn = document.getElementById('updateProjectBtn');
        if (updateProjectBtn) {
            updateProjectBtn.addEventListener('click', () => {
                this.updateProject();
            });
        }
    }

    bindModalFileUpload() {
        const modalUploadZone = document.getElementById('modalUploadZone');
        const modalUploadBtn = document.getElementById('modalUploadBtn');
        const modalFileInput = document.getElementById('modalFileInput');

        if (modalUploadBtn && modalFileInput) {
            modalUploadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modalFileInput.click();
            });
        }

        if (modalUploadZone && modalFileInput) {
            modalUploadZone.addEventListener('click', () => modalFileInput.click());
        }

        // Drag and drop
        if (modalUploadZone) {
            modalUploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                modalUploadZone.classList.add('drag-over');
            });

            modalUploadZone.addEventListener('dragleave', () => {
                modalUploadZone.classList.remove('drag-over');
            });

            modalUploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                modalUploadZone.classList.remove('drag-over');
                this.handleModalFiles(e.dataTransfer.files);
            });
        }

        if (modalFileInput) {
            modalFileInput.addEventListener('change', (e) => {
                this.handleModalFiles(e.target.files);
            });
        }
    }

    bindQuizModalEvents() {
        const closeQuizModal = document.getElementById('closeQuizModal');
        const quizTakingModal = document.getElementById('quizTakingModal');
        const prevQuestion = document.getElementById('prevQuestion');
        const nextQuestion = document.getElementById('nextQuestion');
        const submitQuiz = document.getElementById('submitQuiz');

        if (closeQuizModal && quizTakingModal) {
            closeQuizModal.addEventListener('click', () => {
                quizTakingModal.classList.remove('active');
                this.resetQuiz();
            });
        }

        if (prevQuestion) {
            prevQuestion.addEventListener('click', () => {
                this.previousQuestion();
            });
        }

        if (nextQuestion) {
            nextQuestion.addEventListener('click', () => {
                this.nextQuestion();
            });
        }

        if (submitQuiz) {
            submitQuiz.addEventListener('click', () => {
                this.submitQuiz();
            });
        }
    }

    // ==============================
    // UI RENDERING METHODS
    // ==============================

    renderProjects() {
        const projectsGrid = document.getElementById('projectsGrid');
        if (!projectsGrid) return;

        projectsGrid.innerHTML = '';

        this.projects.forEach(project => {
            const projectCard = this.createProjectCard(project);
            projectsGrid.appendChild(projectCard);
        });
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.addEventListener('click', () => this.openProject(project.id));

        const formatDate = (dateString) => {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        };

        card.innerHTML = `
            <div class="project-header">
                <div class="project-info">
                    <h3>${project.name}</h3>
                    <p>${project.description || 'No description'}</p>
                </div>
                <div class="project-date">
                    ${formatDate(project.created_at)}
                </div>
            </div>
            <div class="project-stats">
                <div class="project-stat">
                    <i class="fas fa-file"></i>
                    <span>${project.file_count || 0} files</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-question-circle"></i>
                    <span>${project.quiz_count || 0} quizzes</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-chart-line"></i>
                    <span>${project.last_score || 0}% avg</span>
                </div>
            </div>
            <div class="project-actions" onclick="event.stopPropagation()">
                <button class="action-btn primary" onclick="dashboard.openProject(${project.id})">
                    Open
                </button>
                <button class="action-btn" onclick="dashboard.quickQuiz(${project.id})">
                    Quick Quiz
                </button>
            </div>
        `;

        return card;
    }

    createFileItem(file, fileId, isSelected = false) {
        const item = document.createElement('div');
        item.className = 'file-item';

        const getFileIcon = (type) => {
            if (type.includes('pdf')) return 'fas fa-file-pdf';
            if (type.includes('image')) return 'fas fa-file-image';
            if (type.includes('word') || type.includes('document')) return 'fas fa-file-word';
            if (type.includes('powerpoint') || type.includes('presentation')) return 'fas fa-file-powerpoint';
            return 'fas fa-file';
        };

        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="${getFileIcon(file.type || file.mime_type)}"></i>
                </div>
                <div class="file-details">
                    <h4>${file.name || file.original_filename}</h4>
                    <p>${formatFileSize(file.size || file.file_size)}</p>
                </div>
            </div>
            <button class="remove-btn" onclick="dashboard.removeFile(${fileId}, ${isSelected})">
                Remove
            </button>
        `;

        return item;
    }

    createQuizItem(quiz) {
        const item = document.createElement('div');
        item.className = 'quiz-item';

        const formatDate = (dateString) => {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        };

        const getDifficultyColor = (difficulty) => {
            switch (difficulty) {
                case 'easy': return '#10b981';
                case 'medium': return '#f59e0b';
                case 'hard': return '#ef4444';
                default: return '#6b7280';
            }
        };

        item.innerHTML = `
            <div class="quiz-header">
                <div class="quiz-info">
                    <h4>${quiz.title}</h4>
                    <p>Created on ${formatDate(quiz.created_at)} • 
                       <span style="color: ${getDifficultyColor(quiz.difficulty)}">${quiz.difficulty}</span>
                    </p>
                </div>
                <div class="quiz-actions">
                    <button class="quiz-btn primary" onclick="dashboard.takeQuiz(${quiz.id})">
                        <i class="fas fa-play"></i> Take Quiz
                    </button>
                    <button class="quiz-btn" onclick="dashboard.downloadQuiz(${quiz.id})">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="quiz-btn" onclick="dashboard.deleteQuiz(${quiz.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
            <div class="quiz-stats">
                <div class="quiz-stat">
                    <i class="fas fa-question-circle"></i>
                    <span>${quiz.question_count} questions</span>
                </div>
                <div class="quiz-stat">
                    <i class="fas fa-chart-line"></i>
                    <span>Best: ${quiz.last_score || 0}%</span>
                </div>
                <div class="quiz-stat">
                    <i class="fas fa-redo"></i>
                    <span>${quiz.attempt_count || 0} attempts</span>
                </div>
            </div>
        `;

        return item;
    }

    // ==============================
    // QUIZ UI METHODS
    // ==============================

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        const targetContent = document.getElementById(`${tabName}Tab`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    renderCurrentQuestion() {
    if (!this.currentQuiz) return;

    const container = document.getElementById('quizContainer');
    const question = this.currentQuiz.questions[this.currentQuestionIndex];

    let optionsHtml = '';

    switch (question.type) {
        case 'multiple-choice':
            if (question.options && typeof question.options === 'object') {
                optionsHtml = Object.entries(question.options).map(([key, option], index) => `
                    <label class="option-item ${this.userAnswers[this.currentQuestionIndex] === index ? 'selected' : ''}">
                        <input type="radio" name="question_${question.id}" value="${index}" 
                               ${this.userAnswers[this.currentQuestionIndex] === index ? 'checked' : ''}
                               onchange="dashboard.selectAnswer(${index})">
                        <span>${key}. ${option}</span>
                    </label>
                `).join('');
            }
            break;

        case 'true-false':
            optionsHtml = `
                <label class="option-item ${this.userAnswers[this.currentQuestionIndex] === 0 ? 'selected' : ''}">
                    <input type="radio" name="question_${question.id}" value="0" 
                           ${this.userAnswers[this.currentQuestionIndex] === 0 ? 'checked' : ''}
                           onchange="dashboard.selectAnswer(0)">
                    <span>True</span>
                </label>
                <label class="option-item ${this.userAnswers[this.currentQuestionIndex] === 1 ? 'selected' : ''}">
                    <input type="radio" name="question_${question.id}" value="1" 
                           ${this.userAnswers[this.currentQuestionIndex] === 1 ? 'checked' : ''}
                           onchange="dashboard.selectAnswer(1)">
                    <span>False</span>
                </label>
            `;
            break;

        case 'short-answer':
            const currentTextAnswer = this.userAnswers[this.currentQuestionIndex] || '';
            optionsHtml = `
                <div class="text-answer-input">
                    <textarea 
                        placeholder="Enter your answer here..." 
                        rows="4"
                        style="width: 100%; padding: 12px; border: 2px solid var(--border); 
                               border-radius: 8px; background: var(--bg-secondary); 
                               color: var(--text-primary); font-family: inherit; 
                               font-size: 16px; resize: vertical; min-height: 100px;"
                        oninput="dashboard.selectTextAnswer(this.value)"
                        onchange="dashboard.selectTextAnswer(this.value)">${currentTextAnswer}</textarea>
                </div>
            `;
            break;

        case 'fill-in-blank':
            const currentAnswers = this.userAnswers[this.currentQuestionIndex] || [];
            const questionParts = question.text.split('___');
            let fillInHtml = '<div class="fill-in-instruction">Fill in the blanks:</div><div class="fill-in-question">';

            for (let i = 0; i < questionParts.length; i++) {
                fillInHtml += `<span>${questionParts[i]}</span>`;

                // Add input field between parts (except after the last part)
                if (i < questionParts.length - 1) {
                    const currentValue = Array.isArray(currentAnswers) ? (currentAnswers[i] || '') : '';
                    fillInHtml += `
                        <input type="text" 
                               class="fill-blank-input" 
                               data-blank-index="${i}"
                               value="${currentValue}"
                               placeholder="..."
                               onchange="dashboard.selectFillInAnswer(${i}, this.value)"
                               oninput="dashboard.selectFillInAnswer(${i}, this.value)"
                               style="display: inline-block; min-width: 120px; width: auto; 
                                      padding: 8px 12px; margin: 0 6px; 
                                      border: 2px solid var(--border); border-radius: 6px; 
                                      background: var(--bg-secondary); color: var(--text-primary); 
                                      font-family: inherit; font-size: 16px; font-weight: 500;">
                    `;
                }
            }
            fillInHtml += '</div>';
            optionsHtml = fillInHtml;
            break;

        default:
            optionsHtml = '<p>Unsupported question type</p>';
    }

    const getTypeColor = (type) => {
        switch(type) {
            case 'multiple-choice': return '#3b82f6';
            case 'true-false': return '#10b981';
            case 'short-answer': return '#f59e0b';
            case 'fill-in-blank': return '#8b5cf6';
            default: return '#6b7280';
        }
    };

    const getTypeLabel = (type) => {
        switch(type) {
            case 'multiple-choice': return 'Multiple Choice';
            case 'true-false': return 'True/False';
            case 'short-answer': return 'Short Answer';
            case 'fill-in-blank': return 'Fill in Blanks';
            default: return type.replace('-', ' ').toUpperCase();
        }
    };

    // For fill-in-blank questions, show clean question text in header
    const displayText = question.type === 'fill-in-blank' ?
        question.text.replace(/___/g, '_____') : question.text;

    container.innerHTML = `
        <div class="question-card">
            <div class="question-header">
                <div class="question-number">${this.currentQuestionIndex + 1}</div>
                <div class="question-text">${displayText}</div>
                <div class="question-type-badge" style="background: ${getTypeColor(question.type)}">
                    ${getTypeLabel(question.type)}
                </div>
            </div>
            <div class="question-options">
                ${optionsHtml}
            </div>
        </div>
    `;
}

    selectFillInAnswer(blankIndex, value) {
        if (!Array.isArray(this.userAnswers[this.currentQuestionIndex])) {
            this.userAnswers[this.currentQuestionIndex] = [];
        }
        this.userAnswers[this.currentQuestionIndex][blankIndex] = value.trim();
    }

    selectTextAnswer(value) {
        this.userAnswers[this.currentQuestionIndex] = value.trim();
    }

    selectAnswer(answerIndex) {
        this.userAnswers[this.currentQuestionIndex] = answerIndex;

        // Update visual selection for radio buttons only
        document.querySelectorAll('.option-item').forEach((item, index) => {
            item.classList.toggle('selected', index === answerIndex);
        });
    }

// Add this new method for handling fill-in-the-blank answers
selectFillInAnswer(blankIndex, value) {
    if (!Array.isArray(this.userAnswers[this.currentQuestionIndex])) {
        this.userAnswers[this.currentQuestionIndex] = [];
    }
    this.userAnswers[this.currentQuestionIndex][blankIndex] = value.trim();
}

// Add this new method for handling text answers
selectTextAnswer(value) {
    this.userAnswers[this.currentQuestionIndex] = value.trim();
}

// Update your selectAnswer method to handle different answer types
selectAnswer(answerIndex) {
    this.userAnswers[this.currentQuestionIndex] = answerIndex;

    // Update visual selection for radio buttons only
    document.querySelectorAll('.option-item').forEach((item, index) => {
        item.classList.toggle('selected', index === answerIndex);
    });
}

    selectAnswer(answerIndex) {
        this.userAnswers[this.currentQuestionIndex] = answerIndex;

        // Update visual selection
        document.querySelectorAll('.option-item').forEach((item, index) => {
            item.classList.toggle('selected', index === answerIndex);
        });
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderCurrentQuestion();
            this.updateQuizProgress();
            this.updateNavigationButtons();
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.currentQuiz.questions.length - 1) {
            this.currentQuestionIndex++;
            this.renderCurrentQuestion();
            this.updateQuizProgress();
            this.updateNavigationButtons();
        }
    }

    updateQuizProgress() {
        const progressFill = document.getElementById('progressFill');
        const questionProgress = document.getElementById('questionProgress');

        if (progressFill && questionProgress) {
            const progress = ((this.currentQuestionIndex + 1) / this.currentQuiz.questions.length) * 100;
            progressFill.style.width = `${progress}%`;
            questionProgress.textContent = `${this.currentQuestionIndex + 1} of ${this.currentQuiz.questions.length}`;
        }

        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevQuestion');
        const nextBtn = document.getElementById('nextQuestion');
        const submitBtn = document.getElementById('submitQuiz');

        if (prevBtn) {
            prevBtn.disabled = this.currentQuestionIndex === 0;
        }

        if (nextBtn && submitBtn) {
            if (this.currentQuestionIndex === this.currentQuiz.questions.length - 1) {
                nextBtn.style.display = 'none';
                submitBtn.style.display = 'inline-flex';
            } else {
                nextBtn.style.display = 'inline-flex';
                submitBtn.style.display = 'none';
            }
        }
    }

    showQuizResults(score, correctAnswers, results = null) {
        const modal = document.getElementById('quizTakingModal');
        const body = modal.querySelector('.modal-body');

        body.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; background: ${score >= 70 ? '#10b981' : '#ef4444'}; 
                           border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                    <i class="fas ${score >= 70 ? 'fa-check' : 'fa-times'}"></i>
                </div>
                <h2 style="margin-bottom: 16px;">Quiz Complete!</h2>
                <div style="font-size: 48px; font-weight: bold; color: ${score >= 70 ? '#10b981' : '#ef4444'}; margin-bottom: 16px;">
                    ${score}%
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 32px;">
                    You got ${correctAnswers} out of ${this.currentQuiz.questions.length} questions correct.
                </p>
                <div style="display: flex; gap: 16px; justify-content: center;">
                    <button class="btn-primary" onclick="dashboard.retakeQuiz()">
                        <i class="fas fa-redo"></i> Retake Quiz
                    </button>
                    <button class="btn-secondary" onclick="dashboard.closeQuizModal()">
                        Close
                    </button>
                </div>
            </div>
        `;
    }

    retakeQuiz() {
        this.currentQuestionIndex = 0;
        this.userAnswers = new Array(this.currentQuiz.questions.length).fill(null);

        // Reset modal body
        const modal = document.getElementById('quizTakingModal');
        const body = modal.querySelector('.modal-body');
        body.innerHTML = `
            <div class="quiz-progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <span class="progress-text" id="questionProgress">1 of ${this.currentQuiz.questions.length}</span>
            </div>
            <div class="quiz-container" id="quizContainer">
                <!-- Quiz questions will be loaded here -->
            </div>
            <div class="quiz-navigation">
                <button class="btn-secondary" id="prevQuestion" disabled>Previous</button>
                <button class="btn-primary" id="nextQuestion">Next</button>
                <button class="btn-primary" id="submitQuiz" style="display: none;">Submit Quiz</button>
            </div>
        `;

        // Re-bind events
        this.bindQuizModalEvents();

        this.renderCurrentQuestion();
        this.updateQuizProgress();
    }

    closeQuizModal() {
        document.getElementById('quizTakingModal').classList.remove('active');
        this.resetQuiz();
    }

    resetQuiz() {
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = [];

        // Reset modal body to original state
        const modal = document.getElementById('quizTakingModal');
        const body = modal.querySelector('.modal-body');
        if (body) {
            body.innerHTML = `
                <div class="quiz-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <span class="progress-text" id="questionProgress">0 of 0</span>
                </div>
                <div class="quiz-container" id="quizContainer">
                    <!-- Quiz questions will be loaded here -->
                </div>
                <div class="quiz-navigation">
                    <button class="btn-secondary" id="prevQuestion" disabled>Previous</button>
                    <button class="btn-primary" id="nextQuestion">Next</button>
                    <button class="btn-primary" id="submitQuiz" style="display: none;">Submit Quiz</button>
                </div>
            `;
        }

        // Re-bind events
        this.bindQuizModalEvents();
    }

    // ==============================
    // UTILITY METHODS
    // ==============================

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            const text = overlay.querySelector('p');
            if (text) text.textContent = message;
            overlay.classList.add('active');
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 24px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            color: var(--text-primary);
            box-shadow: var(--shadow-lg);
            z-index: 9999;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            max-width: 320px;
            border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
        `;

        const icon = type === 'success' ? 'check-circle' :
                    type === 'warning' ? 'exclamation-triangle' :
                    type === 'error' ? 'times-circle' : 'info-circle';

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fas fa-${icon}" style="color: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; margin-left: auto; padding: 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }, 5000);
    }

    // ==============================
    // BONUS FEATURES
    // ==============================

    // Search functionality
    async searchProjects(query) {
        try {
            const response = await this.apiCall(`/projects/search?q=${encodeURIComponent(query)}`);
            const projectsGrid = document.getElementById('projectsGrid');
            if (!projectsGrid) return;

            projectsGrid.innerHTML = '';
            response.projects.forEach(project => {
                const projectCard = this.createProjectCard(project);
                projectsGrid.appendChild(projectCard);
            });
        } catch (error) {
            // Error already handled
        }
    }

    // Analytics functionality
    async getProjectAnalytics(projectId) {
        try {
            const analytics = await this.apiCall(`/projects/${projectId}/analytics`);
            return analytics;
        } catch (error) {
            return null;
        }
    }

    // Export functionality
    async exportProject(projectId) {
        try {
            this.showLoading('Exporting project...');

            const project = await this.apiCall(`/projects/${projectId}/export`);

            const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project.project.name.replace(/\s+/g, '_')}_export.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('Project exported successfully!', 'success');
        } catch (error) {
            this.hideLoading();
        }
    }

    // Render selected files (file upload preview)
    renderSelectedFiles() {
        const fileList = document.getElementById('modalFileList');
        if (!fileList) return;

        // Clear existing selected files
        const existingSelectedFiles = fileList.querySelectorAll('[data-selected="true"]');
        existingSelectedFiles.forEach(item => item.remove());

        // Add selected files preview
        this.selectedFiles.forEach((file, index) => {
            const fileItem = this.createFileItem(file, index, true);
            fileItem.setAttribute('data-selected', 'true');
            fileList.appendChild(fileItem);
        });
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// Global utility functions and event listeners
window.addEventListener('beforeunload', (e) => {
    // In a real app, you might want to save unsaved changes
    const hasUnsavedChanges = false; // This would be determined by your app state

    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N for new project
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.click();
        }
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// Add search functionality to projects
function addSearchFunctionality() {
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search projects...';
    searchInput.className = 'project-search-input';
    searchInput.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--text-primary);
        font-size: 14px;
        margin-bottom: 20px;
        width: 100%;
        max-width: 300px;
    `;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length > 2) {
            window.dashboard.searchProjects(query);
        } else if (query.length === 0) {
            window.dashboard.renderProjects();
        }
    });

    const projectsSection = document.querySelector('.projects-section');
    if (projectsSection) {
        const projectsGrid = projectsSection.querySelector('.projects-grid');
        if (projectsGrid) {
            projectsSection.insertBefore(searchInput, projectsGrid);
        }
    }
}

// Add search functionality after dashboard loads
setTimeout(addSearchFunctionality, 1000);