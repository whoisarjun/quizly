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

            // Load user profile, projects and stats in parallel
            const [userProfile, projectsData, statsData] = await Promise.all([
                this.loadUserProfile(),
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

    async loadUserProfile() {
        try {
            const userProfile = await this.apiCall('/user/profile');

            // Update the display name in header
            const userDisplayName = document.getElementById('userDisplayName');
            if (userDisplayName) {
                userDisplayName.textContent = `${userProfile.first_name} ${userProfile.last_name}`;
            }

            // Update the welcome message
            const welcomeMessage = document.getElementById('welcomeMessage');
            if (welcomeMessage) {
                welcomeMessage.textContent = `Welcome back, ${userProfile.first_name}!`;
            }

        } catch (error) {
            // Fallback if profile loading fails
            const userDisplayName = document.getElementById('userDisplayName');
            if (userDisplayName) {
                userDisplayName.textContent = 'User';
            }

            const welcomeMessage = document.getElementById('welcomeMessage');
            if (welcomeMessage) {
                welcomeMessage.textContent = 'Welcome back!';
            }
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

    updateQuizzesTabState() {
        const quizzesTabBtn = document.getElementById('quizzesTabBtn');
        const hasFiles = this.currentProject && this.currentProject.files && this.currentProject.files.length > 0;

        if (quizzesTabBtn) {
            if (hasFiles) {
                quizzesTabBtn.classList.remove('disabled');
            } else {
                quizzesTabBtn.classList.add('disabled');
            }
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
            this.updateQuizzesTabState();
            document.getElementById('quizTitle').value = `${project.name} Quiz`;

            // Render project content
            this.updateQuizzesTabState();

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
                await this.refreshProjectWithStats();
            }

            if (result.failed_files.length > 0) {
                this.showNotification(`${result.failed_files.length} files failed to upload`, 'warning');
            }

        } catch (error) {
            this.hideLoading();
        }

        this.updateQuizzesTabState();
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

    async refreshProjectWithStats() {
        if (!this.currentProject) return;

        try {
            const [updatedProject, projectStats] = await Promise.all([
                this.loadProject(this.currentProject.id),
                this.apiCall(`/projects/${this.currentProject.id}/stats`).catch(() => null)
            ]);

            if (updatedProject) {
                // Merge project data with stats
                if (projectStats && projectStats.quizzes) {
                    updatedProject.quizzes = updatedProject.quizzes?.map(quiz => {
                        const quizStats = projectStats.quizzes.find(s => s.quiz_id === quiz.id);
                        if (quizStats) {
                            return {
                                ...quiz,
                                attempt_count: quizStats.attempt_count || 0,
                                best_score: quizStats.best_score || 0,
                                avg_score: quizStats.avg_score || 0,
                                last_attempt: quizStats.last_attempt
                            };
                        }
                        return quiz;
                    });
                }

                this.currentProject = updatedProject;
                this.renderProjectFiles();
                this.renderProjectQuizzes();

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
            console.error('Failed to refresh project with stats:', error);
            // Fallback to basic refresh
            await this.refreshCurrentProject();
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
            await this.refreshProjectWithStats();

        } catch (error) {
            // Error already handled
        }

        this.updateQuizzesTabState();
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

            const quizTitle = document.getElementById('quizTitle').value.trim() || `${this.currentProject.name} Quiz`;

            const result = await this.apiCall(`/projects/${this.currentProject.id}/quizzes/generate`, {
                method: 'POST',
                body: JSON.stringify({
                    title: quizTitle,
                    difficulty: difficulty,
                    question_count: questionCount,
                    question_types: questionTypes
                })
            });

            this.hideLoading();
            this.showNotification('Quiz generated successfully!', 'success');

            // Refresh project data to show new quiz
            await this.refreshProjectWithStats();
            this.renderProjectQuizzes();

        } catch (error) {
            this.hideLoading();
        }
    }

    async takeQuiz(quizId) {
    try {
        this.showLoading('Loading quiz...');

        // IMPORTANT: Reset quiz state completely before loading new quiz
        this.resetQuizState();

        const quiz = await this.apiCall(`/quizzes/${quizId}`);

        this.currentQuiz = quiz;
        this.currentQuestionIndex = 0;
        this.userAnswers = new Array(quiz.questions.length).fill(null);

        // Reset the modal body to ensure clean state
        this.resetQuizModalBody();

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
            await this.refreshProjectWithStats();
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

    resetQuizState() {
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
    }

    resetQuizModalBody() {
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

            // Re-bind events after resetting HTML
            this.bindQuizModalEvents();
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

        this.bindModalOverlayEvents();

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

    // Remove existing event listeners to prevent duplicates
    if (closeQuizModal) {
        // Clone node to remove all event listeners
        const newCloseBtn = closeQuizModal.cloneNode(true);
        closeQuizModal.parentNode.replaceChild(newCloseBtn, closeQuizModal);

        newCloseBtn.addEventListener('click', () => {
            this.closeQuizModal();
        });
    }

    if (prevQuestion) {
        const newPrevBtn = prevQuestion.cloneNode(true);
        prevQuestion.parentNode.replaceChild(newPrevBtn, prevQuestion);

        newPrevBtn.addEventListener('click', () => {
            this.previousQuestion();
        });
    }

    if (nextQuestion) {
        const newNextBtn = nextQuestion.cloneNode(true);
        nextQuestion.parentNode.replaceChild(newNextBtn, nextQuestion);

        newNextBtn.addEventListener('click', () => {
            this.nextQuestion();
        });
    }

    if (submitQuiz) {
        const newSubmitBtn = submitQuiz.cloneNode(true);
        submitQuiz.parentNode.replaceChild(newSubmitBtn, submitQuiz);

        newSubmitBtn.addEventListener('click', () => {
            this.submitQuiz();
        });
    }
}

    bindModalOverlayEvents() {
        // Close modals on overlay click, but reset quiz state for quiz modal
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');

                    // Special handling for quiz modal
                    if (overlay.id === 'quizTakingModal') {
                        setTimeout(() => {
                            this.resetQuiz();
                        }, 300);
                    }
                }
            });
        });
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
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const getDifficultyColor = (difficulty) => {
            switch (difficulty) {
                case 'easy': return '#10b981';
                case 'medium': return '#f59e0b';
                case 'hard': return '#ef4444';
                case 'extreme': return '#c306ff';
                default: return '#6b7280';
            }
        };

        const getPerformanceColor = (score) => {
            if (score >= 90) return '#10b981';
            if (score >= 80) return '#22c55e';
            if (score >= 70) return '#f59e0b';
            if (score >= 60) return '#fb923c';
            return '#ef4444';
        };

        const getPerformanceIcon = (score) => {
            if (score >= 90) return 'fa-trophy';
            if (score >= 80) return 'fa-medal';
            if (score >= 70) return 'fa-thumbs-up';
            if (score >= 60) return 'fa-meh';
            return 'fa-thumbs-down';
        };

        // FIX: Ensure we have proper data with fallbacks
        const attemptCount = quiz.attempt_count || quiz.attempts || 0;
        const bestScore = quiz.best_score || quiz.last_score || quiz.highest_score || 0;
        const avgScore = quiz.avg_score || quiz.average_score || bestScore;

        item.innerHTML = `
            <div class="quiz-header">
                <div class="quiz-info">
                    <h4 class="quiz-title">${quiz.title}</h4>
                    <div class="quiz-meta">
                        <span class="quiz-date">Created ${formatDate(quiz.created_at)}</span>
                        <span class="quiz-difficulty" style="color: ${getDifficultyColor(quiz.difficulty)}">
                            <i class="fas fa-signal"></i> ${quiz.difficulty}
                        </span>
                    </div>
                </div>
                <div class="quiz-actions">
                    <button class="quiz-btn primary" onclick="dashboard.takeQuiz(${quiz.id})" title="Start a new attempt">
                        <i class="fas fa-play"></i> Take Quiz
                    </button>
                    <button class="quiz-btn" onclick="dashboard.toggleQuizHistory(${quiz.id}, this)" title="View attempt history">
                        <i class="fas fa-history"></i> History
                    </button>
                    <button class="quiz-btn" onclick="dashboard.showQuizAnalytics(${quiz.id})" title="View detailed analytics">
                        <i class="fas fa-chart-bar"></i> Analytics
                    </button>
                    <button class="quiz-btn" onclick="dashboard.downloadQuiz(${quiz.id})" title="Download quiz">
                        <i class="fas fa-download"></i> Export
                    </button>
                    <button class="quiz-btn danger" onclick="dashboard.deleteQuiz(${quiz.id})" title="Delete quiz">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="quiz-stats-grid">
                <div class="quiz-stat">
                    <div class="stat-icon">
                        <i class="fas fa-question-circle"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-number">${quiz.question_count || 0}</span>
                        <span class="stat-label">Questions</span>
                    </div>
                </div>
                <div class="quiz-stat">
                    <div class="stat-icon">
                        <i class="fas fa-redo"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-number">${attemptCount}</span>
                        <span class="stat-label">Attempts</span>
                    </div>
                </div>
                <div class="quiz-stat">
                    <div class="stat-icon" style="color: ${getPerformanceColor(bestScore)}">
                        <i class="fas ${getPerformanceIcon(bestScore)}"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-number" style="color: ${getPerformanceColor(bestScore)}">${bestScore}%</span>
                        <span class="stat-label">Best Score</span>
                    </div>
                </div>
                <div class="quiz-stat">
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-number">${Math.ceil((quiz.question_count || 10) * 1.5)}</span>
                        <span class="stat-label">Est. Minutes</span>
                    </div>
                </div>
            </div>
            
            ${(attemptCount > 0) ? `
                <div class="quiz-performance-summary">
                    <div class="performance-indicator">
                        <div class="performance-bar">
                            <div class="performance-fill" style="width: ${bestScore}%; background: ${getPerformanceColor(bestScore)};"></div>
                        </div>
                        <span class="performance-text">
                            ${bestScore >= 90 ? 'Excellent Performance!' : 
                              bestScore >= 80 ? 'Great Job!' :
                              bestScore >= 70 ? 'Good Work!' :
                              bestScore >= 60 ? 'Keep Practicing!' : 'Needs Improvement'}
                        </span>
                    </div>
                </div>
            ` : `
                <div class="quiz-performance-summary">
                    <div class="no-attempts-message">
                        <i class="fas fa-play-circle"></i>
                        <span>Take your first attempt to see performance insights!</span>
                    </div>
                </div>
            `}
            
            <div class="quiz-history" id="history-${quiz.id}" style="display: none;">
                <div class="history-header">
                    <h5><i class="fas fa-history"></i> Attempt History</h5>
                    <div class="history-controls">
                        <button class="history-control-btn" onclick="dashboard.refreshQuizHistory(${quiz.id})" title="Refresh history">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="history-control-btn" onclick="dashboard.exportQuizHistory(${quiz.id})" title="Export all attempts">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                    <div class="history-loading" style="display: none;">
                        <i class="fas fa-spinner fa-spin"></i> Loading...
                    </div>
                </div>
                <div class="history-content">
                    <!-- History will be loaded here -->
                </div>
            </div>
            
            <div class="quiz-analytics" id="analytics-${quiz.id}" style="display: none;">
                <div class="analytics-header">
                    <h5><i class="fas fa-chart-bar"></i> Performance Analytics</h5>
                    <div class="analytics-loading" style="display: none;">
                        <i class="fas fa-spinner fa-spin"></i> Loading analytics...
                    </div>
                </div>
                <div class="analytics-content">
                    <!-- Analytics will be loaded here -->
                </div>
            </div>
        `;

        // Process LaTeX in quiz title and other content
        this.processLatexInElement(item);

        return item;
    }

    // ==============================
    // QUIZ UI METHODS
    // ==============================

    switchTab(tabName) {
    // Check if trying to switch to disabled quizzes tab
    if (tabName === 'quizzes') {
        const quizzesTabBtn = document.getElementById('quizzesTabBtn');
        if (quizzesTabBtn && quizzesTabBtn.classList.contains('disabled')) {
            return; // Don't switch
        }
    }

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
                            <span class="option-text">${key}. ${option}</span>
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
                        <span class="option-text">True</span>
                    </label>
                    <label class="option-item ${this.userAnswers[this.currentQuestionIndex] === 1 ? 'selected' : ''}">
                        <input type="radio" name="question_${question.id}" value="1" 
                               ${this.userAnswers[this.currentQuestionIndex] === 1 ? 'checked' : ''}
                               onchange="dashboard.selectAnswer(1)">
                        <span class="option-text">False</span>
                    </label>
                `;
                break;

            case 'short-answer':
                const currentTextAnswer = this.userAnswers[this.currentQuestionIndex] || '';
                optionsHtml = `
                    <div class="text-answer-input">
                        <textarea 
                            placeholder="Enter your answer here (you can use LaTeX like \`x^2\` or \`\\sin{x}\`)..." 
                            rows="4"
                            class="answer-textarea"
                            style="width: 100%; padding: 12px; border: 2px solid var(--border); 
                                   border-radius: 8px; background: var(--bg-secondary); 
                                   color: var(--text-primary); font-family: inherit; 
                                   font-size: 16px; resize: vertical; min-height: 100px;"
                            oninput="dashboard.selectTextAnswer(this.value)"
                            onchange="dashboard.selectTextAnswer(this.value)">${currentTextAnswer}</textarea>
                        <div class="latex-preview" style="margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; min-height: 20px;">
                            <small style="color: var(--text-secondary);">Preview: </small>
                            <span class="preview-content"></span>
                        </div>
                    </div>
                `;
                break;

            case 'fill-in-blank':
                const currentAnswers = this.userAnswers[this.currentQuestionIndex] || [];
                let cleanQuestionText = question.text;

                const fillInPrefixes = [
                    'Fill in the blank:',
                    'Fill in the blanks:',
                    'fill in the blank:',
                    'fill in the blanks:'
                ];

                for (const prefix of fillInPrefixes) {
                    if (cleanQuestionText.toLowerCase().startsWith(prefix.toLowerCase())) {
                        cleanQuestionText = cleanQuestionText.substring(prefix.length).trim();
                        break;
                    }
                }

                const blankRegex = /_+/g;
                const blankCount = (cleanQuestionText.match(blankRegex) || []).length;
                const questionParts = cleanQuestionText.split(blankRegex);

                if (!Array.isArray(this.userAnswers[this.currentQuestionIndex])) {
                    this.userAnswers[this.currentQuestionIndex] = new Array(blankCount).fill('');
                }

                let fillInHtml = '<div class="fill-in-question">';

                for (let i = 0; i < questionParts.length; i++) {
                    fillInHtml += `<span class="question-part">${questionParts[i]}</span>`;

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

        const displayText = question.type === 'fill-in-blank' ? 'Fill in the blank:' : question.text;

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

        // Process LaTeX in the rendered content
        this.processLatexInElement(container);

        // Set up preview for short answer questions
        if (question.type === 'short-answer') {
            this.setupAnswerPreview();
        }
    }

    selectFillInAnswer(blankIndex, value) {
        if (!Array.isArray(this.userAnswers[this.currentQuestionIndex])) {
            this.userAnswers[this.currentQuestionIndex] = [];
        }
        this.userAnswers[this.currentQuestionIndex][blankIndex] = value.trim();
    }

    selectTextAnswer(value) {
        this.userAnswers[this.currentQuestionIndex] = value.trim();

        // Update preview if it exists
        const previewContent = document.querySelector('.preview-content');
        if (previewContent) {
            const processed = this.processLatexInText(value);
            previewContent.innerHTML = processed || '<em>Your answer preview will appear here...</em>';
        }
    }

    selectAnswer(answerIndex) {
        this.userAnswers[this.currentQuestionIndex] = answerIndex;

        // Update visual selection for radio buttons only
        document.querySelectorAll('.option-item').forEach((item, index) => {
            item.classList.toggle('selected', index === answerIndex);
        });
    }

    setupAnswerPreview() {
        const textarea = document.querySelector('.answer-textarea');
        const previewContent = document.querySelector('.preview-content');

        if (textarea && previewContent) {
            const updatePreview = () => {
                const processed = this.processLatexInText(textarea.value);
                previewContent.innerHTML = processed || '<em>Your answer preview will appear here...</em>';
            };

            // Initial preview
            updatePreview();

            // Update on input
            textarea.addEventListener('input', updatePreview);
        }
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
    if (!this.currentQuiz) return;

    // Reset answers but keep the same quiz
    this.currentQuestionIndex = 0;
    this.userAnswers = new Array(this.currentQuiz.questions.length).fill(null);

    // Reset modal body
    this.resetQuizModalBody();

    this.renderCurrentQuestion();
    this.updateQuizProgress();
}

    closeQuizModal() {
    const modal = document.getElementById('quizTakingModal');
    modal.classList.remove('active');

    // Add a small delay to ensure modal is closed before resetting
    setTimeout(() => {
        this.resetQuiz();
    }, 300);
}

    resetQuiz() {
    this.resetQuizState();
    this.resetQuizModalBody();
}

    async toggleQuizHistory(quizId, button) {
    const historyDiv = document.getElementById(`history-${quizId}`);
    const historyContent = historyDiv.querySelector('.history-content');
    const loadingDiv = historyDiv.querySelector('.history-loading');
    const icon = button.querySelector('i');

    if (historyDiv.style.display === 'none') {
        // Show history
        historyDiv.style.display = 'block';
        icon.className = 'fas fa-chevron-up';
        button.innerHTML = '<i class="fas fa-chevron-up"></i> Hide History';

        // FIX: Always load attempts when showing history, don't wait for manual refresh
        try {
            loadingDiv.style.display = 'block';
            historyContent.innerHTML = ''; // Clear any old content

            const attempts = await this.getQuizAttempts(quizId);
            this.renderQuizHistory(historyContent, attempts);
            loadingDiv.style.display = 'none';
        } catch (error) {
            loadingDiv.style.display = 'none';
            historyContent.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Failed to load history</p>';
        }
    } else {
        // Hide history
        historyDiv.style.display = 'none';
        icon.className = 'fas fa-history';
        button.innerHTML = '<i class="fas fa-history"></i> History';
    }
}

    async getQuizAttempts(quizId) {
        try {
            const response = await this.apiCall(`/quizzes/${quizId}/attempts`);
            return response.attempts || [];
        } catch (error) {
            console.error('Failed to get quiz attempts:', error);
            throw error;
        }
    }

    renderQuizHistory(container, attempts) {
        if (!attempts || attempts.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No attempts yet</p>';
            return;
        }

        container.innerHTML = '';

        attempts.forEach((attempt, index) => {
            const attemptItem = this.createAttemptItem(attempt, attempts.length - index);
            container.appendChild(attemptItem);
        });
    }

    createAttemptItem(attempt, attemptNumber) {
        const item = document.createElement('div');
        item.className = 'attempt-item';

        const formatDate = (dateString) => {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const getScoreColor = (score) => {
            if (score >= 90) return '#10b981';
            if (score >= 80) return '#22c55e';
            if (score >= 70) return '#f59e0b';
            if (score >= 60) return '#fb923c';
            return '#ef4444';
        };

        const getScoreGrade = (score) => {
            if (score >= 90) return 'A';
            if (score >= 80) return 'B';
            if (score >= 70) return 'C';
            if (score >= 60) return 'D';
            return 'F';
        };

        const hasDetailedFeedback = attempt.validation_results && attempt.validation_results.validation_results;
        const isLLMValidated = attempt.validation_results && attempt.validation_results.validation_method === 'llm';

        item.innerHTML = `
            <div class="attempt-header">
                <div class="attempt-info">
                    <div class="attempt-number">
                        <span class="attempt-badge">Attempt ${attemptNumber}</span>
                        ${isLLMValidated ? '<span class="llm-badge"><i class="fas fa-robot"></i> AI Validated</span>' : ''}
                    </div>
                    <div class="attempt-date">${formatDate(attempt.submitted_at)}</div>
                </div>
                <div class="attempt-score">
                    <div class="score-display" style="background: ${getScoreColor(attempt.score)};">
                        <span class="score-number">${attempt.score}%</span>
                        <span class="score-grade">${getScoreGrade(attempt.score)}</span>
                    </div>
                </div>
            </div>
            
            ${hasDetailedFeedback ? `
                <div class="attempt-actions">
                    <button class="attempt-btn" onclick="dashboard.viewAttemptDetails(${attempt.id})">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="attempt-btn" onclick="dashboard.downloadAttemptResults(${attempt.id})">
                        <i class="fas fa-download"></i> Download
                    </button>
                    ${attempt.revalidated_at ? `
                        <span class="revalidated-badge">
                            <i class="fas fa-sync"></i> Re-validated ${formatDate(attempt.revalidated_at)}
                        </span>
                    ` : `
                        <button class="attempt-btn" onclick="dashboard.revalidateQuizAttempt(${attempt.id})">
                            <i class="fas fa-robot"></i> Re-validate
                        </button>
                    `}
                </div>
            ` : `
                <div class="attempt-actions">
                    <button class="attempt-btn" onclick="dashboard.revalidateQuizAttempt(${attempt.id})">
                        <i class="fas fa-robot"></i> Get AI Feedback
                    </button>
                </div>
            `}
            
            <div class="attempt-summary" id="summary-${attempt.id}" style="display: none;">
                <!-- Detailed summary will be loaded here -->
            </div>
        `;

        return item;
    }

    async viewAttemptDetails(attemptId) {
        try {
            this.showLoading('Loading attempt details...');

            const attempt = await this.apiCall(`/quiz-attempts/${attemptId}`);

            this.hideLoading();
            this.showAttemptDetailsModal(attempt);

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to load attempt details', 'error');
        }
    }

    showAttemptDetailsModal(attempt) {
        // Create and show a modal with detailed attempt information
        const modal = document.createElement('div');
        modal.className = 'modal-overlay attempt-details-modal';
        modal.style.zIndex = '10000';

        const hasDetailedResults = attempt.validation_results && attempt.validation_results.validation_results;

        modal.innerHTML = `
            <div class="modal large">
                <div class="modal-header">
                    <h2>Attempt Details</h2>
                    <div class="attempt-meta">
                        <span class="attempt-score-large" style="background: ${this.getScoreColor(attempt.score)};">
                            ${attempt.score}%
                        </span>
                        <div class="attempt-info-text">
                            <p>Quiz: ${attempt.quiz_title}</p>
                            <p>Submitted: ${new Date(attempt.submitted_at).toLocaleString()}</p>
                            ${attempt.validation_results ? '<p><i class="fas fa-robot"></i> AI Enhanced Grading</p>' : ''}
                        </div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${hasDetailedResults ? this.renderDetailedResults(attempt.validation_results.validation_results) : 
                      '<p style="text-align: center; color: var(--text-secondary);">Basic scoring only. Use AI re-validation for detailed feedback.</p>'}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');

        // Process LaTeX in the modal content
        this.processLatexInElement(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    renderDetailedResults(results) {
        if (!results || results.length === 0) {
            return '<p>No detailed results available.</p>';
        }

        let html = '<div class="detailed-results">';

        results.forEach((result, index) => {
            const scoreColor = result.score_percentage >= 100 ? '#10b981' :
                              result.score_percentage >= 50 ? '#f59e0b' : '#ef4444';

            html += `
                <div class="result-item" style="margin-bottom: 20px; padding: 16px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${scoreColor};">
                    <div class="result-header">
                        <h4>Question ${index + 1}</h4>
                        <div class="result-score" style="background: ${scoreColor}; color: white; padding: 4px 8px; border-radius: 4px;">
                            ${result.score_percentage || 0}%
                        </div>
                    </div>
                    
                    ${result.question_text ? `
                        <div class="question-text" style="margin: 8px 0; color: var(--text-secondary);">
                            ${result.question_text}
                        </div>
                    ` : ''}
                    
                    <div class="student-answer" style="margin: 8px 0;">
                        <strong>Your Answer:</strong> ${result.student_answer || 'No answer provided'}
                    </div>
                    
                    ${result.feedback ? `
                        <div class="feedback" style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-top: 8px;">
                            <strong>Feedback:</strong>
                            <p style="margin: 4px 0 0 0; color: var(--text-secondary);">${result.feedback}</p>
                        </div>
                    ` : ''}
                    
                    ${result.partial_credit_details ? `
                        <div class="partial-credit" style="background: #fef3c7; padding: 8px; border-radius: 6px; margin-top: 8px; border: 1px solid #f59e0b;">
                            <small style="color: #92400e;">
                                <i class="fas fa-info-circle"></i> ${result.partial_credit_details}
                            </small>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    getScoreColor(score) {
        if (score >= 90) return '#10b981';
        if (score >= 80) return '#22c55e';
        if (score >= 70) return '#f59e0b';
        if (score >= 60) return '#fb923c';
        return '#ef4444';
    }

    async revalidateQuizAttempt(attemptId) {
        try {
            this.showLoading('Re-validating with AI...');

            const result = await this.apiCall(`/quiz-attempts/${attemptId}/revalidate`, {
                method: 'POST'
            });

            this.hideLoading();
            this.showNotification('Re-validation complete!', 'success');

            // Refresh the quiz list to show updated results
            if (this.currentProject) {
                await this.refreshProjectWithStats();
                this.renderProjectQuizzes();
            }

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to re-validate attempt', 'error');
        }
    }

    async downloadAttemptResults(attemptId) {
        try {
            this.showLoading('Generating results...');

            const attempt = await this.apiCall(`/quiz-attempts/${attemptId}`);

            // Create downloadable content
            let content = `QUIZ ATTEMPT RESULTS\n`;
            content += `===================\n\n`;
            content += `Quiz: ${attempt.quiz_title}\n`;
            content += `Date: ${new Date(attempt.submitted_at).toLocaleDateString()}\n`;
            content += `Score: ${attempt.score}%\n`;
            content += `Grade: ${this.getScoreGrade(attempt.score)}\n\n`;

            if (attempt.validation_results && attempt.validation_results.validation_results) {
                content += `DETAILED FEEDBACK\n`;
                content += `================\n\n`;

                attempt.validation_results.validation_results.forEach((result, index) => {
                    content += `Question ${index + 1}\n`;
                    content += `-------------\n`;
                    if (result.question_text) {
                        content += `${result.question_text}\n\n`;
                    }
                    content += `Your Answer: ${result.student_answer || 'No answer provided'}\n`;
                    content += `Score: ${result.score_percentage}%\n`;
                    if (result.feedback) {
                        content += `Feedback: ${result.feedback}\n`;
                    }
                    if (result.partial_credit_details) {
                        content += `Partial Credit: ${result.partial_credit_details}\n`;
                    }
                    content += `\n`;
                });
            }

            // Download the file
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz_attempt_${attemptId}_results.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('Results downloaded!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to download results', 'error');
        }
    }

    getScoreGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    async showQuizAnalytics(quizId) {
    const analyticsDiv = document.getElementById(`analytics-${quizId}`);
    const analyticsContent = analyticsDiv.querySelector('.analytics-content');
    const loadingDiv = analyticsDiv.querySelector('.analytics-loading');

    if (analyticsDiv.style.display === 'none') {
        // Show analytics
        analyticsDiv.style.display = 'block';

        // FIX: Always load analytics when showing, don't wait for manual action
        try {
            loadingDiv.style.display = 'block';
            analyticsContent.innerHTML = ''; // Clear any old content

            const analytics = await this.getQuizAnalytics(quizId);
            this.renderQuizAnalytics(analyticsContent, analytics);
            loadingDiv.style.display = 'none';
        } catch (error) {
            loadingDiv.style.display = 'none';
            analyticsContent.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Failed to load analytics</p>';
        }
    } else {
        // Hide analytics
        analyticsDiv.style.display = 'none';
    }
}

    async getQuizAnalytics(quizId) {
        try {
            const response = await this.apiCall(`/quizzes/${quizId}/analytics`);
            return response;
        } catch (error) {
            console.error('Failed to get quiz analytics:', error);
            throw error;
        }
    }

    renderQuizAnalytics(container, analytics) {
        if (!analytics) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No analytics data available</p>';
            return;
        }

        const getScoreColor = (score) => {
            if (score >= 90) return '#10b981';
            if (score >= 80) return '#22c55e';
            if (score >= 70) return '#f59e0b';
            if (score >= 60) return '#fb923c';
            return '#ef4444';
        };

        const getTrendIcon = (trend) => {
            if (trend > 2) return '<i class="fas fa-arrow-up" style="color: #10b981;"></i>';
            if (trend < -2) return '<i class="fas fa-arrow-down" style="color: #ef4444;"></i>';
            return '<i class="fas fa-minus" style="color: #6b7280;"></i>';
        };

        container.innerHTML = `
            <div class="analytics-overview">
                <div class="analytics-stats">
                    <div class="analytics-stat">
                        <div class="stat-header">
                            <i class="fas fa-redo"></i>
                            <span>Total Attempts</span>
                        </div>
                        <div class="stat-value">${analytics.total_attempts || 0}</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="stat-header">
                            <i class="fas fa-chart-line"></i>
                            <span>Average Score</span>
                        </div>
                        <div class="stat-value" style="color: ${getScoreColor(analytics.avg_score || 0)}">${analytics.avg_score || 0}%</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="stat-header">
                            <i class="fas fa-trophy"></i>
                            <span>Best Score</span>
                        </div>
                        <div class="stat-value" style="color: ${getScoreColor(analytics.best_score || 0)}">${analytics.best_score || 0}%</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="stat-header">
                            <i class="fas fa-chart-area"></i>
                            <span>Improvement</span>
                        </div>
                        <div class="stat-value">
                            ${getTrendIcon(analytics.improvement_trend || 0)}
                            <span>${Math.abs(analytics.improvement_trend || 0).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
    
            ${analytics.recent_scores && analytics.recent_scores.length > 1 ? `
                <div class="score-progression">
                    <h6><i class="fas fa-chart-line"></i> Recent Score Progression</h6>
                    <div class="progression-chart">
                        ${analytics.recent_scores.slice().reverse().map((score, index) => `
                            <div class="progression-point" style="height: ${(score/100) * 60}px; background: ${getScoreColor(score)};" title="Attempt ${index + 1}: ${score}%">
                                <span class="progression-label">${score}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
    
            ${analytics.consistency_score !== undefined ? `
                <div class="consistency-meter">
                    <h6><i class="fas fa-balance-scale"></i> Consistency Score</h6>
                    <div class="consistency-bar">
                        <div class="consistency-fill" style="width: ${analytics.consistency_score}%; background: ${getScoreColor(analytics.consistency_score)};"></div>
                    </div>
                    <p class="consistency-text">
                        ${analytics.consistency_score >= 80 ? 'Very consistent performance!' :
                          analytics.consistency_score >= 60 ? 'Moderately consistent' :
                          'Performance varies significantly'}
                    </p>
                </div>
            ` : ''}
    
            <div class="analytics-insights">
                <h6><i class="fas fa-lightbulb"></i> Performance Insights</h6>
                <div class="insights-list">
                    ${this.generateInsights(analytics).map(insight => `
                        <div class="insight-item ${insight.type}">
                            <i class="fas ${insight.icon}"></i>
                            <span>${insight.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    generateInsights(analytics) {
        const insights = [];

        if (!analytics || analytics.total_attempts === 0) {
            return [{ type: 'info', icon: 'fa-info-circle', text: 'Take your first attempt to get personalized insights!' }];
        }

        // Performance insights
        if (analytics.best_score >= 95) {
            insights.push({ type: 'success', icon: 'fa-star', text: 'Outstanding mastery of this topic!' });
        } else if (analytics.best_score >= 85) {
            insights.push({ type: 'success', icon: 'fa-thumbs-up', text: 'Excellent understanding demonstrated!' });
        } else if (analytics.best_score < 70) {
            insights.push({ type: 'warning', icon: 'fa-book-open', text: 'Consider reviewing the material more thoroughly.' });
        }

        // Improvement trend insights
        if (analytics.improvement_trend > 5) {
            insights.push({ type: 'success', icon: 'fa-arrow-up', text: 'Great improvement trend! Keep it up!' });
        } else if (analytics.improvement_trend < -5) {
            insights.push({ type: 'warning', icon: 'fa-arrow-down', text: 'Scores are declining. Take a break and review.' });
        }

        // Consistency insights
        if (analytics.consistency_score >= 80) {
            insights.push({ type: 'success', icon: 'fa-check-circle', text: 'Very consistent performance across attempts.' });
        } else if (analytics.consistency_score < 50) {
            insights.push({ type: 'info', icon: 'fa-exclamation-triangle', text: 'Performance varies significantly between attempts.' });
        }

        // Attempt frequency insights
        if (analytics.total_attempts === 1) {
            insights.push({ type: 'info', icon: 'fa-play', text: 'Try taking the quiz again to track your progress!' });
        } else if (analytics.total_attempts > 10) {
            insights.push({ type: 'info', icon: 'fa-medal', text: 'Dedicated learner! Many attempts show commitment.' });
        }

        // LLM validation insights
        if (analytics.detailed_attempts > 0) {
            insights.push({ type: 'info', icon: 'fa-robot', text: `${analytics.detailed_attempts} attempts have detailed AI feedback available.` });
        }

        return insights.length > 0 ? insights : [{ type: 'info', icon: 'fa-chart-bar', text: 'Keep taking attempts to unlock more insights!' }];
    }

    async refreshQuizHistory(quizId) {
        const historyContent = document.querySelector(`#history-${quizId} .history-content`);
        const loadingDiv = document.querySelector(`#history-${quizId} .history-loading`);

        try {
            loadingDiv.style.display = 'block';
            historyContent.innerHTML = '';

            const attempts = await this.getQuizAttempts(quizId);
            this.renderQuizHistory(historyContent, attempts);

            loadingDiv.style.display = 'none';
            this.showNotification('History refreshed!', 'success');
        } catch (error) {
            loadingDiv.style.display = 'none';
            this.showNotification('Failed to refresh history', 'error');
        }
    }

    async exportQuizHistory(quizId) {
        try {
            this.showLoading('Exporting quiz history...');

            const attempts = await this.getQuizAttempts(quizId);
            const quiz = this.currentProject.quizzes.find(q => q.id === quizId);

            if (!attempts || attempts.length === 0) {
                this.hideLoading();
                this.showNotification('No attempts to export', 'warning');
                return;
            }

            // Create comprehensive export content
            let content = `QUIZ HISTORY EXPORT\n`;
            content += `==================\n\n`;
            content += `Quiz: ${quiz?.title || 'Unknown Quiz'}\n`;
            content += `Exported: ${new Date().toLocaleString()}\n`;
            content += `Total Attempts: ${attempts.length}\n\n`;

            attempts.forEach((attempt, index) => {
                content += `ATTEMPT ${index + 1}\n`;
                content += `-----------\n`;
                content += `Date: ${new Date(attempt.submitted_at).toLocaleString()}\n`;
                content += `Score: ${attempt.score}%\n`;
                content += `AI Validated: ${attempt.is_llm_validated ? 'Yes' : 'No'}\n`;
                if (attempt.revalidated_at) {
                    content += `Re-validated: ${new Date(attempt.revalidated_at).toLocaleString()}\n`;
                }
                content += `\n`;
            });

            // Add performance summary
            const scores = attempts.map(a => a.score);
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const bestScore = Math.max(...scores);
            const worstScore = Math.min(...scores);

            content += `PERFORMANCE SUMMARY\n`;
            content += `==================\n`;
            content += `Average Score: ${avgScore.toFixed(1)}%\n`;
            content += `Best Score: ${bestScore}%\n`;
            content += `Lowest Score: ${worstScore}%\n`;
            content += `Improvement: ${(bestScore - worstScore).toFixed(1)}%\n`;

            // Download the file
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz_${quizId}_history.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('History exported successfully!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to export history', 'error');
        }
    }

    debugQuizState() {
        console.log('Current Quiz State:', {
            currentQuiz: this.currentQuiz,
            currentQuestionIndex: this.currentQuestionIndex,
            userAnswers: this.userAnswers,
            modalBody: document.querySelector('#quizTakingModal .modal-body')?.innerHTML?.substring(0, 100) + '...'
        });
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

    processLatexInText(text) {
        if (!text || typeof text !== 'string') return text;

        // Check if KaTeX is available
        if (typeof katex === 'undefined') {
            console.warn('KaTeX not loaded - LaTeX expressions will not be rendered');
            return text;
        }

        // Regular expression to find backtick-surrounded expressions
        const latexRegex = /`([^`]+)`/g;

        return text.replace(latexRegex, (match, expression) => {
            try {
                // Clean the expression
                const cleanExpression = expression.trim();

                // Render with KaTeX
                const rendered = katex.renderToString(cleanExpression, {
                    throwOnError: false,
                    displayMode: false, // inline math
                    output: 'html'
                });

                return `<span class="latex-inline">${rendered}</span>`;
            } catch (error) {
                console.warn('LaTeX rendering error:', error.message, 'for expression:', expression);
                // Return original if rendering fails
                return match;
            }
        });
    }

    processLatexInElement(element) {
        if (!element) return;

        // Find all text nodes and process them
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip if parent is already a LaTeX element or script/style
                    const parent = node.parentElement;
                    if (parent && (
                        parent.classList.contains('latex-inline') ||
                        parent.tagName === 'SCRIPT' ||
                        parent.tagName === 'STYLE'
                    )) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('`')) {
                textNodes.push(node);
            }
        }

        // Process each text node
        textNodes.forEach(textNode => {
            const processedHTML = this.processLatexInText(textNode.textContent);
            if (processedHTML !== textNode.textContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = processedHTML;

                // Replace text node with processed content
                const parent = textNode.parentNode;
                while (tempDiv.firstChild) {
                    parent.insertBefore(tempDiv.firstChild, textNode);
                }
                parent.removeChild(textNode);
            }
        });
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

        // Updated quiz submission methods for dashboard.js
    }

    showEnhancedQuizResults(result) {
        const modal = document.getElementById('quizTakingModal');
        const body = modal.querySelector('.modal-body');

        // Store the original modal body HTML before showing results
        if (!this.originalQuizModalBody) {
            this.originalQuizModalBody = `
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

        const isLLMValidated = result.validation_method === 'llm';
        const hasDetailedFeedback = result.detailed_feedback && result.results;

        let resultsHTML = `
            <div class="quiz-results-container" style="text-align: center; padding: 20px;">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; background: ${result.score >= 70 ? '#10b981' : '#ef4444'}; 
                           border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                    <i class="fas ${result.score >= 70 ? 'fa-check' : 'fa-times'}"></i>
                </div>
                <h2 style="margin-bottom: 16px;">Quiz Complete!</h2>
                <div style="font-size: 48px; font-weight: bold; color: ${result.score >= 70 ? '#10b981' : '#ef4444'}; margin-bottom: 16px;">
                    ${result.score}%
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">
                    You got ${result.correct_answers} out of ${result.total_questions} questions correct.
                </p>
                
                ${isLLMValidated ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                        <i class="fas fa-robot" style="color: #3b82f6; margin-right: 8px;"></i>
                        <span style="color: var(--text-secondary); font-size: 14px;">
                            Enhanced AI validation with detailed feedback
                        </span>
                    </div>
                ` : ''}
        `;

        if (hasDetailedFeedback && result.results.length > 0) {
            resultsHTML += `
                <div style="max-height: 400px; overflow-y: auto; margin: 20px 0;">
                    <h3 style="margin-bottom: 16px; text-align: center;">Detailed Feedback</h3>
            `;

            result.results.forEach((questionResult, index) => {
                const question = this.currentQuiz.questions.find(q => q.id === questionResult.question_id);
                if (!question) return;

                const scoreColor = questionResult.score_percentage >= 100 ? '#10b981' :
                                  questionResult.score_percentage >= 50 ? '#f59e0b' : '#ef4444';

                resultsHTML += `
                    <div class="feedback-item" style="margin-bottom: 20px; padding: 16px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${scoreColor};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h4 style="margin: 0; flex: 1;">Question ${index + 1}</h4>
                            <div style="background: ${scoreColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: bold;">
                                ${questionResult.score_percentage || 0}%
                            </div>
                        </div>
                        <p class="feedback-question" style="margin: 8px 0; color: var(--text-secondary); font-size: 14px;">
                            ${question.text}
                        </p>
                        
                        ${questionResult.feedback ? `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-top: 8px;">
                                <strong style="color: var(--text-primary);">Feedback:</strong>
                                <p class="feedback-text" style="margin: 4px 0 0 0; color: var(--text-secondary);">
                                    ${questionResult.feedback}
                                </p>
                            </div>
                        ` : ''}
                        
                        ${questionResult.partial_credit_details ? `
                            <div style="background: #fef3c7; padding: 8px; border-radius: 6px; margin-top: 8px; border: 1px solid #f59e0b;">
                                <small class="partial-credit" style="color: #92400e;">
                                    <i class="fas fa-info-circle"></i> ${questionResult.partial_credit_details}
                                </small>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            resultsHTML += `</div>`;
        }

        resultsHTML += `
                    <div style="display: flex; gap: 16px; justify-content: center; padding: 20px;">
                        <button class="btn-primary" onclick="dashboard.retakeQuiz()">
                            <i class="fas fa-redo"></i> Retake Quiz
                        </button>
                        ${result.attempt_id ? `
                            <button class="btn-secondary" onclick="dashboard.revalidateQuiz(${result.attempt_id})">
                                <i class="fas fa-robot"></i> Re-validate with AI
                            </button>
                        ` : ''}
                        ${hasDetailedFeedback ? `
                            <button class="btn-secondary" onclick="dashboard.downloadDetailedResults(${result.attempt_id || 'null'})">
                                <i class="fas fa-download"></i> Download Results
                            </button>
                        ` : ''}
                        <button class="btn-secondary" onclick="dashboard.closeQuizModal()">
                            Close
                        </button>
                    </div>
                </div>
            `;

        body.innerHTML = resultsHTML;

        // Process LaTeX in all the feedback content
        if (this.processLatexInElement) {
            this.processLatexInElement(body);
        }
    }

    async revalidateQuiz(attemptId) {
        if (!attemptId) {
            this.showNotification('Cannot re-validate: attempt ID not found', 'warning');
            return;
        }

        try {
            this.showLoading('Re-validating answers with enhanced AI...');

            const result = await this.apiCall(`/quiz-attempts/${attemptId}/revalidate`, {
                method: 'POST'
            });

            this.hideLoading();

            // Show revalidation results
            this.showRevalidationResults(result);

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to re-validate quiz', 'error');
        }
    }

    showRevalidationResults(result) {
        const modal = document.getElementById('quizTakingModal');
        const body = modal.querySelector('.modal-body');

        const scoreDifference = result.new_score - result.old_score;
        const scoreColor = scoreDifference > 0 ? '#10b981' : scoreDifference < 0 ? '#ef4444' : '#6b7280';

        body.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; background: #3b82f6; 
                           border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                    <i class="fas fa-robot"></i>
                </div>
                <h2 style="margin-bottom: 16px;">AI Re-validation Complete!</h2>
                
                <div style="display: flex; justify-content: center; gap: 32px; margin: 32px 0;">
                    <div style="text-align: center;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Original Score</div>
                        <div style="font-size: 32px; font-weight: bold; color: var(--text-primary);">
                            ${result.old_score}%
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; color: ${scoreColor};">
                        <i class="fas fa-arrow-right" style="font-size: 24px;"></i>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">New Score</div>
                        <div style="font-size: 32px; font-weight: bold; color: ${scoreColor};">
                            ${result.new_score}%
                        </div>
                    </div>
                </div>
                
                <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin: 24px 0;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">
                        <i class="fas ${scoreDifference > 0 ? 'fa-arrow-up' : scoreDifference < 0 ? 'fa-arrow-down' : 'fa-equals'}" 
                           style="color: ${scoreColor};"></i>
                        <span style="color: ${scoreColor}; font-weight: bold;">
                            ${scoreDifference > 0 ? '+' : ''}${scoreDifference.toFixed(1)} points
                        </span>
                    </div>
                    <p style="color: var(--text-secondary); margin: 0; font-size: 14px;">
                        ${scoreDifference > 0 ? 'Your score improved with AI validation!' : 
                          scoreDifference < 0 ? 'AI validation resulted in a lower score.' : 
                          'Your score remained the same.'}
                    </p>
                </div>
    
                <div style="display: flex; gap: 16px; justify-content: center;">
                    <button class="btn-primary" onclick="dashboard.showEnhancedQuizResults(${JSON.stringify(result.validation_results).replace(/"/g, '&quot;')})">
                        <i class="fas fa-eye"></i> View Detailed Results
                    </button>
                    <button class="btn-secondary" onclick="dashboard.closeQuizModal()">
                        Close
                    </button>
                </div>
            </div>
        `;
    }

    async downloadDetailedResults(attemptId) {
        if (!attemptId) {
            this.showNotification('Cannot download: attempt ID not found', 'warning');
            return;
        }

        try {
            this.showLoading('Generating detailed results...');

            // Get the attempt details
            const attempt = await this.apiCall(`/quiz-attempts/${attemptId}`);

            if (!attempt.validation_results) {
                this.showNotification('No detailed results available', 'warning');
                this.hideLoading();
                return;
            }

            // Create downloadable content
            let content = `QUIZ RESULTS - DETAILED FEEDBACK\n`;
            content += `=====================================\n\n`;
            content += `Quiz: ${this.currentQuiz.title}\n`;
            content += `Date: ${new Date(attempt.submitted_at).toLocaleDateString()}\n`;
            content += `Overall Score: ${attempt.validation_results.overall_score}%\n`;
            content += `Validation Method: Enhanced AI\n\n`;

            if (attempt.validation_results.validation_results) {
                attempt.validation_results.validation_results.forEach((result, index) => {
                    const question = this.currentQuiz.questions.find(q => q.id === result.question_id);
                    if (!question) return;

                    content += `QUESTION ${index + 1}\n`;
                    content += `-----------\n`;
                    content += `${question.text}\n\n`;
                    content += `Your Answer: ${result.student_answer}\n`;
                    content += `Score: ${result.score_percentage}%\n`;
                    content += `Status: ${result.is_correct ? 'Correct' : 'Incorrect'}\n\n`;

                    if (result.feedback) {
                        content += `Feedback:\n${result.feedback}\n\n`;
                    }

                    if (result.partial_credit_details) {
                        content += `Partial Credit: ${result.partial_credit_details}\n\n`;
                    }

                    content += `\n`;
                });
            }

            // Download the file
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.currentQuiz.title.replace(/\s+/g, '_')}_detailed_results.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('Detailed results downloaded!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification('Failed to download results', 'error');
        }
    }

    // Add a new endpoint to get quiz attempt details
    async getQuizAttempt(attemptId) {
        try {
            const attempt = await this.apiCall(`/quiz-attempts/${attemptId}`);
            return attempt;
        } catch (error) {
            this.showNotification('Failed to get quiz attempt details', 'error');
            return null;
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

    diagnoseQuizIssue() {
        console.log('=== QUIZ DIAGNOSTIC ===');
        console.log('Current Quiz:', this.currentQuiz);
        console.log('Current Question Index:', this.currentQuestionIndex);
        console.log('User Answers:', this.userAnswers);

        const modal = document.getElementById('quizTakingModal');
        const body = modal?.querySelector('.modal-body');
        console.log('Modal Body HTML:', body?.innerHTML?.substring(0, 200) + '...');

        const container = document.getElementById('quizContainer');
        console.log('Quiz Container HTML:', container?.innerHTML?.substring(0, 200) + '...');

        console.log('Modal is active:', modal?.classList.contains('active'));

        // Check if there are any results showing
        const resultsContainer = body?.querySelector('.quiz-results-container');
        console.log('Results container found:', !!resultsContainer);

        console.log('=== END DIAGNOSTIC ===');
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