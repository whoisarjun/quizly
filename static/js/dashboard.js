// Dashboard functionality
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

        this.init();
    }

    init() {
        this.loadSampleData();
        this.bindEvents();
        this.renderProjects();
        this.updateStats();
    }

    loadSampleData() {
        // Sample projects data
        this.projects = [
            {
                id: 1,
                name: "Biology Chapter 12",
                description: "Cell biology and mitosis study materials",
                createdAt: new Date('2024-01-15'),
                fileCount: 5,
                quizCount: 3,
                lastScore: 92,
                files: [
                    { name: 'cell_biology.pdf', size: 2456789, type: 'application/pdf' },
                    { name: 'mitosis_notes.docx', size: 876543, type: 'application/msword' },
                    { name: 'cell_diagram.png', size: 345678, type: 'image/png' }
                ],
                quizzes: [
                    {
                        id: 1,
                        title: "Cell Biology Quiz",
                        difficulty: "medium",
                        questionCount: 15,
                        createdAt: new Date('2024-01-16'),
                        lastScore: 92,
                        attempts: 3,
                        questions: this.generateSampleQuestions()
                    }
                ]
            },
            {
                id: 2,
                name: "World History Finals",
                description: "WWI and WWII comprehensive review",
                createdAt: new Date('2024-01-10'),
                fileCount: 8,
                quizCount: 5,
                lastScore: 85,
                files: [
                    { name: 'wwi_timeline.pdf', size: 1234567, type: 'application/pdf' },
                    { name: 'wwii_notes.docx', size: 987654, type: 'application/msword' }
                ],
                quizzes: [
                    {
                        id: 2,
                        title: "World War I Quiz",
                        difficulty: "hard",
                        questionCount: 20,
                        createdAt: new Date('2024-01-12'),
                        lastScore: 85,
                        attempts: 2,
                        questions: this.generateHistoryQuestions()
                    }
                ]
            },
            {
                id: 3,
                name: "Calculus Practice",
                description: "Derivatives and integrals problem sets",
                createdAt: new Date('2024-01-08'),
                fileCount: 3,
                quizCount: 2,
                lastScore: 78,
                files: [
                    { name: 'derivatives_notes.pdf', size: 567890, type: 'application/pdf' }
                ],
                quizzes: [
                    {
                        id: 3,
                        title: "Derivatives Quiz",
                        difficulty: "medium",
                        questionCount: 12,
                        createdAt: new Date('2024-01-09'),
                        lastScore: 78,
                        attempts: 1,
                        questions: this.generateMathQuestions()
                    }
                ]
            }
        ];
    }

    generateSampleQuestions() {
        return [
            {
                id: 1,
                text: "What is the primary function of mitochondria in a cell?",
                type: "multiple-choice",
                options: [
                    "Protein synthesis",
                    "Energy production (ATP synthesis)",
                    "DNA replication",
                    "Waste removal"
                ],
                correctAnswer: 1,
                explanation: "Mitochondria are known as the powerhouses of the cell because they produce ATP through cellular respiration."
            },
            {
                id: 2,
                text: "During which phase of mitosis do chromosomes align at the cell's equator?",
                type: "multiple-choice",
                options: [
                    "Prophase",
                    "Metaphase",
                    "Anaphase",
                    "Telophase"
                ],
                correctAnswer: 1,
                explanation: "During metaphase, chromosomes align at the metaphase plate (cell's equator) before being separated."
            },
            {
                id: 3,
                text: "The cell membrane is primarily composed of:",
                type: "multiple-choice",
                options: [
                    "Proteins only",
                    "Carbohydrates only",
                    "Phospholipid bilayer with embedded proteins",
                    "DNA and RNA"
                ],
                correctAnswer: 2,
                explanation: "The cell membrane consists of a phospholipid bilayer with various embedded proteins that control what enters and exits the cell."
            }
        ];
    }

    generateHistoryQuestions() {
        return [
            {
                id: 1,
                text: "What event is commonly considered the trigger for World War I?",
                type: "multiple-choice",
                options: [
                    "Sinking of the Lusitania",
                    "Assassination of Archduke Franz Ferdinand",
                    "German invasion of Belgium",
                    "Russian Revolution"
                ],
                correctAnswer: 1,
                explanation: "The assassination of Archduke Franz Ferdinand in Sarajevo on June 28, 1914, triggered the chain of events that led to WWI."
            }
        ];
    }

    generateMathQuestions() {
        return [
            {
                id: 1,
                text: "What is the derivative of x²?",
                type: "multiple-choice",
                options: [
                    "x",
                    "2x",
                    "x²",
                    "2x²"
                ],
                correctAnswer: 1,
                explanation: "Using the power rule, the derivative of x² is 2x."
            }
        ];
    }

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
        card.addEventListener('click', () => this.openProject(project));

        const formatDate = (date) => {
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
                    <p>${project.description}</p>
                </div>
                <div class="project-date">
                    ${formatDate(project.createdAt)}
                </div>
            </div>
            <div class="project-stats">
                <div class="project-stat">
                    <i class="fas fa-file"></i>
                    <span>${project.fileCount} files</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-question-circle"></i>
                    <span>${project.quizCount} quizzes</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-chart-line"></i>
                    <span>${project.lastScore}% avg</span>
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

    updateStats() {
        const totalProjects = this.projects.length;
        const totalQuizzes = this.projects.reduce((sum, project) => sum + project.quizCount, 0);
        const avgScore = totalProjects > 0 ? Math.round(
            this.projects.reduce((sum, project) => sum + project.lastScore, 0) / totalProjects
        ) : 0;

        // Update stat cards
        const statCards = document.querySelectorAll('.stat-card .stat-content h3');
        if (statCards.length >= 3) {
            statCards[0].textContent = totalProjects;
            statCards[1].textContent = totalQuizzes;
            statCards[2].textContent = `${avgScore}%`;
        }
    }

    createNewProject() {
        const projectName = document.getElementById('projectName').value;
        const projectDesc = document.getElementById('projectDesc').value;

        if (!projectName.trim()) {
            alert('Please enter a project name');
            return;
        }

        const newProject = {
            id: this.projects.length + 1,
            name: projectName,
            description: projectDesc || '',
            createdAt: new Date(),
            fileCount: 0,
            quizCount: 0,
            lastScore: 0,
            files: [],
            quizzes: []
        };

        this.projects.push(newProject);
        this.renderProjects();
        this.updateStats();

        // Close modal and reset form
        document.getElementById('newProjectModal').classList.remove('active');
        document.getElementById('newProjectForm').reset();

        // Show success message
        this.showNotification('Project created successfully!', 'success');
    }

    openProject(projectId) {
        // Handle both object and ID being passed
        const project = typeof projectId === 'object' ? projectId : this.projects.find(p => p.id === projectId);
        if (!project) return;

        this.currentProject = project;

        // Update modal title
        document.getElementById('projectTitle').textContent = project.name;

        // Update settings form
        document.getElementById('editProjectName').value = project.name;
        document.getElementById('editProjectDesc').value = project.description;

        // Show modal
        document.getElementById('projectModal').classList.add('active');

        // Switch to files tab and render content
        this.switchTab('files');
        this.renderProjectFiles();
        this.renderProjectQuizzes();
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    handleModalFiles(files) {
        Array.from(files).forEach(file => {
            if (this.selectedFiles.length >= this.maxFiles) {
                this.showNotification(`Maximum ${this.maxFiles} files allowed`, 'warning');
                return;
            }

            if (file.size > this.maxSize) {
                this.showNotification(`File ${file.name} is too large (max 25MB)`, 'warning');
                return;
            }

            // Check if file already exists
            if (this.selectedFiles.some(f => f.name === file.name)) {
                this.showNotification(`File ${file.name} already added`, 'warning');
                return;
            }

            this.selectedFiles.push(file);
        });

        this.renderSelectedFiles();
        this.updateProjectFiles();
    }

    renderSelectedFiles() {
        const fileList = document.getElementById('modalFileList');
        if (!fileList) return;

        fileList.innerHTML = '';

        this.selectedFiles.forEach((file, index) => {
            const fileItem = this.createFileItem(file, index, true);
            fileList.appendChild(fileItem);
        });
    }

    renderProjectFiles() {
        if (!this.currentProject) return;

        const fileList = document.getElementById('modalFileList');
        if (!fileList) return;

        fileList.innerHTML = '';

        this.currentProject.files.forEach((file, index) => {
            const fileItem = this.createFileItem(file, index, false);
            fileList.appendChild(fileItem);
        });
    }

    createFileItem(file, index, isSelected = false) {
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
                    <i class="${getFileIcon(file.type)}"></i>
                </div>
                <div class="file-details">
                    <h4>${file.name}</h4>
                    <p>${formatFileSize(file.size)}</p>
                </div>
            </div>
            <button class="remove-btn" onclick="dashboard.removeFile(${index}, ${isSelected})">
                Remove
            </button>
        `;

        return item;
    }

    removeFile(index, isSelected) {
        if (isSelected) {
            this.selectedFiles.splice(index, 1);
            this.renderSelectedFiles();
        } else {
            this.currentProject.files.splice(index, 1);
            this.currentProject.fileCount = this.currentProject.files.length;
            this.renderProjectFiles();
            this.renderProjects();
            this.updateStats();
        }
    }

    updateProjectFiles() {
        if (!this.currentProject) return;

        // Add selected files to current project
        this.selectedFiles.forEach(file => {
            this.currentProject.files.push({
                name: file.name,
                size: file.size,
                type: file.type
            });
        });

        this.currentProject.fileCount = this.currentProject.files.length;
        this.selectedFiles = [];

        this.renderProjects();
        this.updateStats();
        this.showNotification('Files added successfully!', 'success');
    }

    renderProjectQuizzes() {
        if (!this.currentProject) return;

        const quizList = document.getElementById('quizList');
        if (!quizList) return;

        quizList.innerHTML = '';

        this.currentProject.quizzes.forEach(quiz => {
            const quizItem = this.createQuizItem(quiz);
            quizList.appendChild(quizItem);
        });
    }

    createQuizItem(quiz) {
        const item = document.createElement('div');
        item.className = 'quiz-item';

        const formatDate = (date) => {
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
                    <p>Created on ${formatDate(quiz.createdAt)} • 
                       <span style="color: ${getDifficultyColor(quiz.difficulty)}">${quiz.difficulty}</span>
                    </p>
                </div>
                <div class="quiz-actions">
                    <button class="quiz-btn primary" onclick="dashboard.takeQuiz(${quiz.id})">
                        <i class="fas fa-play"></i> Take Quiz
                    </button>
                    <button class="quiz-btn" onclick="dashboard.downloadQuiz(${quiz.id})">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                    <button class="quiz-btn" onclick="dashboard.deleteQuiz(${quiz.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
            <div class="quiz-stats">
                <div class="quiz-stat">
                    <i class="fas fa-question-circle"></i>
                    <span>${quiz.questionCount} questions</span>
                </div>
                <div class="quiz-stat">
                    <i class="fas fa-chart-line"></i>
                    <span>Best: ${quiz.lastScore}%</span>
                </div>
                <div class="quiz-stat">
                    <i class="fas fa-redo"></i>
                    <span>${quiz.attempts || 0} attempts</span>
                </div>
            </div>
        `;

        return item;
    }

    generateQuiz() {
        if (!this.currentProject || this.currentProject.files.length === 0) {
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

        // Show loading
        this.showLoading('Generating your quiz...');

        // Simulate AI quiz generation
        setTimeout(() => {
            const newQuiz = {
                id: Date.now(),
                title: `${this.currentProject.name} Quiz`,
                difficulty: difficulty,
                questionCount: questionCount,
                createdAt: new Date(),
                lastScore: 0,
                attempts: 0,
                questions: this.generateQuizQuestions(questionCount, difficulty, questionTypes)
            };

            this.currentProject.quizzes.push(newQuiz);
            this.currentProject.quizCount = this.currentProject.quizzes.length;

            this.hideLoading();
            this.renderProjectQuizzes();
            this.renderProjects();
            this.updateStats();
            this.showNotification('Quiz generated successfully!', 'success');
        }, 2000);
    }

    generateQuizQuestions(count, difficulty, types) {
        const questions = [];
        const sampleQuestions = this.generateSampleQuestions();

        for (let i = 0; i < count; i++) {
            // In a real app, this would use AI to generate questions from uploaded files
            const randomQuestion = sampleQuestions[i % sampleQuestions.length];
            questions.push({
                ...randomQuestion,
                id: i + 1,
                text: `Question ${i + 1}: ${randomQuestion.text}`
            });
        }

        return questions;
    }

    takeQuiz(quizId) {
        const quiz = this.currentProject.quizzes.find(q => q.id === quizId);
        if (!quiz) return;

        this.currentQuiz = quiz;
        this.currentQuestionIndex = 0;
        this.userAnswers = new Array(quiz.questions.length).fill(null);

        // Show quiz modal
        document.getElementById('quizTakingModal').classList.add('active');
        document.getElementById('quizTakingTitle').textContent = quiz.title;

        this.renderCurrentQuestion();
        this.updateQuizProgress();
    }

    renderCurrentQuestion() {
        if (!this.currentQuiz) return;

        const container = document.getElementById('quizContainer');
        const question = this.currentQuiz.questions[this.currentQuestionIndex];

        container.innerHTML = `
            <div class="question-card">
                <div class="question-header">
                    <div class="question-number">${this.currentQuestionIndex + 1}</div>
                    <div class="question-text">${question.text}</div>
                </div>
                <div class="question-options">
                    ${question.options.map((option, index) => `
                        <label class="option-item ${this.userAnswers[this.currentQuestionIndex] === index ? 'selected' : ''}">
                            <input type="radio" name="question_${question.id}" value="${index}" 
                                   ${this.userAnswers[this.currentQuestionIndex] === index ? 'checked' : ''}
                                   onchange="dashboard.selectAnswer(${index})">
                            <span>${option}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
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
        const progress = ((this.currentQuestionIndex + 1) / this.currentQuiz.questions.length) * 100;
        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('questionProgress').textContent =
            `${this.currentQuestionIndex + 1} of ${this.currentQuiz.questions.length}`;

        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevQuestion');
        const nextBtn = document.getElementById('nextQuestion');
        const submitBtn = document.getElementById('submitQuiz');

        prevBtn.disabled = this.currentQuestionIndex === 0;

        if (this.currentQuestionIndex === this.currentQuiz.questions.length - 1) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-flex';
        } else {
            nextBtn.style.display = 'inline-flex';
            submitBtn.style.display = 'none';
        }
    }

    submitQuiz() {
        // Calculate score
        let correctAnswers = 0;
        this.currentQuiz.questions.forEach((question, index) => {
            if (this.userAnswers[index] === question.correctAnswer) {
                correctAnswers++;
            }
        });

        const score = Math.round((correctAnswers / this.currentQuiz.questions.length) * 100);

        // Update quiz stats
        this.currentQuiz.lastScore = score;
        this.currentQuiz.attempts = (this.currentQuiz.attempts || 0) + 1;

        // Update project average
        const projectQuizzes = this.currentProject.quizzes;
        const avgScore = Math.round(
            projectQuizzes.reduce((sum, quiz) => sum + quiz.lastScore, 0) / projectQuizzes.length
        );
        this.currentProject.lastScore = avgScore;

        // Show results
        this.showQuizResults(score, correctAnswers);

        // Update displays
        this.renderProjects();
        this.renderProjectQuizzes();
        this.updateStats();
    }

    showQuizResults(score, correctAnswers) {
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
        body.innerHTML = `
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
    }

    quickQuiz(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || project.quizzes.length === 0) {
            this.showNotification('No quizzes available for this project', 'warning');
            return;
        }

        // Take the most recent quiz
        const latestQuiz = project.quizzes[project.quizzes.length - 1];
        this.currentProject = project;
        this.takeQuiz(latestQuiz.id);
    }

    downloadQuiz(quizId) {
        const quiz = this.currentProject.quizzes.find(q => q.id === quizId);
        if (!quiz) return;

        // In a real app, this would generate and download a PDF
        this.showLoading('Generating PDF...');

        setTimeout(() => {
            this.hideLoading();

            // Create a simple text representation for demo
            let content = `${quiz.title}\n`;
            content += `Difficulty: ${quiz.difficulty}\n`;
            content += `Questions: ${quiz.questionCount}\n\n`;

            quiz.questions.forEach((question, index) => {
                content += `${index + 1}. ${question.text}\n`;
                question.options.forEach((option, optIndex) => {
                    content += `   ${String.fromCharCode(65 + optIndex)}. ${option}\n`;
                });
                content += `   Answer: ${String.fromCharCode(65 + question.correctAnswer)}\n\n`;
            });

            // Create and download file
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${quiz.title.replace(/\s+/g, '_')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.showNotification('Quiz downloaded successfully!', 'success');
        }, 1000);
    }

    deleteQuiz(quizId) {
        if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
            return;
        }

        const quizIndex = this.currentProject.quizzes.findIndex(q => q.id === quizId);
        if (quizIndex !== -1) {
            this.currentProject.quizzes.splice(quizIndex, 1);
            this.currentProject.quizCount = this.currentProject.quizzes.length;

            this.renderProjectQuizzes();
            this.renderProjects();
            this.updateStats();
            this.showNotification('Quiz deleted successfully!', 'success');
        }
    }

    deleteProject() {
        if (!this.currentProject) return;

        const projectName = this.currentProject.name;
        if (!confirm(`Are you sure you want to delete "${projectName}"? This will delete all files and quizzes. This action cannot be undone.`)) {
            return;
        }

        const projectIndex = this.projects.findIndex(p => p.id === this.currentProject.id);
        if (projectIndex !== -1) {
            this.projects.splice(projectIndex, 1);

            // Close modal
            document.getElementById('projectModal').classList.remove('active');

            this.renderProjects();
            this.updateStats();
            this.showNotification(`Project "${projectName}" deleted successfully!`, 'success');

            this.currentProject = null;
        }
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = overlay.querySelector('p');
        if (text) text.textContent = message;
        overlay.classList.add('active');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
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

    // Utility method to format file sizes
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Search functionality (bonus feature)
    searchProjects(query) {
        const filteredProjects = this.projects.filter(project =>
            project.name.toLowerCase().includes(query.toLowerCase()) ||
            project.description.toLowerCase().includes(query.toLowerCase())
        );

        // Render filtered projects
        const projectsGrid = document.getElementById('projectsGrid');
        if (!projectsGrid) return;

        projectsGrid.innerHTML = '';
        filteredProjects.forEach(project => {
            const projectCard = this.createProjectCard(project);
            projectsGrid.appendChild(projectCard);
        });
    }

    // Export/Import functionality (bonus feature)
    exportProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        const exportData = {
            name: project.name,
            description: project.description,
            quizzes: project.quizzes,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name.replace(/\s+/g, '_')}_export.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.showNotification('Project exported successfully!', 'success');
    }

    // Analytics functionality (bonus feature)
    getProjectAnalytics(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;

        const quizzes = project.quizzes;
        if (quizzes.length === 0) return null;

        const totalAttempts = quizzes.reduce((sum, quiz) => sum + (quiz.attempts || 0), 0);
        const averageScore = Math.round(
            quizzes.reduce((sum, quiz) => sum + quiz.lastScore, 0) / quizzes.length
        );
        const bestScore = Math.max(...quizzes.map(quiz => quiz.lastScore));
        const worstScore = Math.min(...quizzes.map(quiz => quiz.lastScore));

        return {
            totalQuizzes: quizzes.length,
            totalAttempts,
            averageScore,
            bestScore,
            worstScore,
            recentActivity: quizzes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
        };
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// Add some global utility functions
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
        document.getElementById('newProjectBtn').click();
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});