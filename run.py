from flask import Flask, request, jsonify, session, send_file, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
from argon2 import PasswordHasher
import os
from datetime import datetime
import json
from functools import wraps

# Import your database modules
from database import db_init, db_utils, files_db, projects_db, quizzes_db, users_db
from file_manager import text_extractor
from llm import chatbot

app = Flask(__name__, static_folder='static')
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB max file size

CORS(app)  # Enable CORS for frontend

# Initialize database and password hasher
db_init.init_all_tables()
ph = PasswordHasher()


# ==============================
# UTILITY FUNCTIONS
# ==============================

def require_auth(f):
    """Decorator to require authentication"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': {'code': 'UNAUTHORIZED', 'message': 'Authentication required'}}), 401
        return f(*args, **kwargs)

    return decorated_function


def get_current_user_id():
    """Get current user ID from session"""
    return session.get('user_id')


def handle_error(e, message="An error occurred"):
    """Standard error handler"""
    print(f"Error: {e}")
    return jsonify({
        'error': {
            'code': 'SERVER_ERROR',
            'message': message,
            'timestamp': datetime.now().isoformat()
        }
    }), 500


# ==============================
# PAGE ROUTES (Your original routes)
# ==============================

@app.route('/')
def home():
    return render_template('index.html')


@app.route('/login')
def login_page():
    return render_template('sign_in.html')


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')


# ==============================
# AUTHENTICATION ENDPOINTS
# ==============================

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': 'Email and password required'}}), 400

        if users_db.user_exists(email):
            validation = users_db.validate_user(email, password)
            if validation[0]:
                # GET THE USER ID FROM YOUR DATABASE AND SET IT IN SESSION
                print(validation[1])
                user_info = validation[1]
                session['user_id'] = user_info['user_id']  # <-- ADD THIS LINE (use whatever key has the user ID)
                print(f'Successfully signed in {email}')
                return jsonify({
                    'user': user_info,
                    'message': 'Login successful'
                })
            else:
                return jsonify({'error': {'code': 'INVALID_CREDENTIALS',
                                          'message': validation[1].get('message', 'Invalid credentials')}}), 401
        else:
            return jsonify({'error': {'code': 'INVALID_CREDENTIALS', 'message': 'Invalid email or password'}}), 401

    except Exception as e:
        return handle_error(e, "Login failed")


@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})


@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        email = data.get('email')
        password = data.get('password')

        if not all([first_name, last_name, email, password]):
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': 'All fields required'}}), 400

        if users_db.user_exists(email):
            return jsonify({'error': {'code': 'USER_EXISTS', 'message': 'User already exists'}}), 400

        # Hash password before storing
        hashed_password = ph.hash(password)
        user_id = users_db.create_new_user(first_name, last_name, email, hashed_password)

        # Get user info and set session
        user_info = db_utils.get_user_info(user_id)
        session['user_id'] = user_id

        return jsonify({
            'user': user_info,
            'message': 'Registration successful'
        }), 201

    except Exception as e:
        return handle_error(e, "Registration failed")


# Legacy endpoints for backward compatibility
@app.route('/create_user', methods=['POST'])
def create_user():
    """Legacy endpoint - redirects to new API"""
    return register()


@app.route('/sign_in', methods=['POST'])
def sign_in():
    """Legacy endpoint - redirects to new API"""
    return login()


# ==============================
# USER PROFILE ENDPOINTS
# ==============================

@app.route('/api/user/profile', methods=['GET'])
@require_auth
def get_profile():
    try:
        user_id = get_current_user_id()
        user_info = db_utils.get_user_info(user_id)
        return jsonify(user_info)
    except Exception as e:
        return handle_error(e, "Failed to get profile")


# ==============================
# DASHBOARD STATS ENDPOINT
# ==============================

@app.route('/api/dashboard/stats', methods=['GET'])
@require_auth
def get_dashboard_stats():
    try:
        user_id = get_current_user_id()

        # Get project stats
        project_stats = projects_db.get_project_stats(user_id)

        # Get quiz analytics
        quiz_analytics = quizzes_db.get_user_quiz_analytics(user_id)

        # Get storage usage
        storage_usage = db_utils.get_user_storage_usage(user_id)

        return jsonify({
            'total_projects': project_stats.get('total_projects', 0),
            'total_quizzes': project_stats.get('total_quizzes', 0),
            'total_files': project_stats.get('total_files', 0),
            'average_score': quiz_analytics.get('average_score', 0),
            'total_attempts': quiz_analytics.get('total_attempts', 0),
            'storage_used': storage_usage,
            'recent_activity': quiz_analytics.get('recent_activity', [])
        })

    except Exception as e:
        return handle_error(e, "Failed to get dashboard stats")


# ==============================
# PROJECT ENDPOINTS
# ==============================

@app.route('/api/projects', methods=['GET'])
@require_auth
def get_projects():
    try:
        user_id = get_current_user_id()
        projects = projects_db.get_user_projects(user_id)

        return jsonify({
            'projects': projects,
            'total_count': len(projects)
        })

    except Exception as e:
        return handle_error(e, "Failed to get projects")


@app.route('/api/projects', methods=['POST'])
@require_auth
def create_project():
    try:
        user_id = get_current_user_id()
        data = request.get_json()

        name = data.get('name', '').strip()
        description = data.get('description', '').strip()

        if not name:
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': 'Project name is required'}}), 400

        project_id = projects_db.create_new_project(user_id, name, description)['id']
        project = projects_db.get_project_by_id(project_id, user_id)

        return jsonify(project), 201

    except Exception as e:
        return handle_error(e, "Failed to create project")


@app.route('/api/projects/<int:project_id>', methods=['GET'])
@require_auth
def get_project(project_id):
    try:
        user_id = get_current_user_id()

        # Verify ownership
        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        project = projects_db.get_project_by_id(project_id, user_id)
        if not project:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

        # Get files and quizzes for this project
        project_files = files_db.get_project_files(project_id)
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        project['files'] = project_files
        project['quizzes'] = project_quizzes

        return jsonify(project)

    except Exception as e:
        return handle_error(e, "Failed to get project")


# ==============================
# FILE ENDPOINTS
# ==============================

@app.route('/api/projects/<int:project_id>/files/upload', methods=['POST'])
@require_auth
def upload_files(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        if 'files' not in request.files:
            return jsonify({'error': {'code': 'NO_FILES', 'message': 'No files provided'}}), 400

        files = request.files.getlist('files')
        uploaded_files = []
        failed_files = []

        # Create upload directory if it doesn't exist
        upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(project_id))
        os.makedirs(upload_dir, exist_ok=True)

        for file in files:
            if file.filename == '':
                continue

            try:
                # Secure the filename
                filename = secure_filename(file.filename)
                file_path = os.path.join(upload_dir, filename)

                # Save the file
                file.save(file_path)

                # Add to database
                file_id = files_db.add_file_to_project(
                    project_id,
                    file.filename,
                    os.path.getsize(file_path),
                    file.mimetype or 'application/octet-stream',
                    file_path
                )

                uploaded_files.append({
                    'id': file_id,
                    'name': file.filename,
                    'size': os.path.getsize(file_path),
                    'type': file.mimetype,
                    'processing_status': 'pending'
                })

            except Exception as file_error:
                failed_files.append({
                    'name': file.filename,
                    'error': str(file_error)
                })

        return jsonify({
            'uploaded_files': uploaded_files,
            'failed_files': failed_files
        }), 201

    except Exception as e:
        return handle_error(e, "Failed to upload files")

# ==============================
# QUIZ GENERATION ENDPOINT (Your original functionality)
# ==============================

@app.route('/generate', methods=['POST'])
def generate():
    """Legacy quiz generation endpoint"""
    try:
        print('Made post request for quiz generation')
        files = request.files.getlist('files')

        saved_files = []
        upload_folder = os.path.join(app.root_path, 'temp')
        os.makedirs(upload_folder, exist_ok=True)

        print('Received files')
        for file in files:
            filename = file.filename
            filepath = os.path.join(upload_folder, filename)
            file.save(filepath)
            saved_files.append(filename)

        filepaths = [os.path.join(upload_folder, filename) for filename in saved_files]
        file_content = text_extractor.generate_plaintext(filepaths)
        response = chatbot.generate_quiz_prompt(file_content)

        # Save response for debugging
        with open('temp/test.txt', 'w') as f:
            f.write(response)

        return jsonify({
            "status": "success",
            "message": f"Received {len(saved_files)} files.",
            "quiz": response
        })

    except Exception as e:
        return handle_error(e, "Failed to generate quiz")


@app.route('/api/projects/<int:project_id>/quizzes/generate', methods=['POST'])
@require_auth
def generate_quiz_from_project(project_id):
    """New API endpoint for generating quizzes from project files"""
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        data = request.get_json()

        title = data.get('title', f'Quiz {datetime.now().strftime("%Y-%m-%d %H:%M")}')
        difficulty = data.get('difficulty', 'medium')
        question_count = data.get('question_count', 10)
        question_types = data.get('question_types', ['multiple-choice'])

        # Get project files
        project_files = files_db.get_project_files(project_id)

        if not project_files:
            return jsonify({'error': {'code': 'NO_FILES', 'message': 'No files found in project'}}), 400

        # Extract text content from files
        file_paths = [file['file_path'] for file in project_files]
        file_content = text_extractor.generate_plaintext(file_paths)

        # Generate quiz using your LLM
        quiz_response = chatbot.generate_quiz_prompt(file_content, specifications={
            'difficulty': difficulty,
            'questions': question_count,
            'question_types': question_types
        })

        # DELETETHISONDEPLOYMENT:
        with open('temp/test.txt', 'w') as f:
            f.write(quiz_response)

        # Parse the response and create quiz in database
        # You'll need to implement parsing logic based on your LLM output format
        questions = parse_quiz_response(quiz_response, question_count, difficulty, question_types)

        # Create quiz in database
        quiz_id = quizzes_db.create_quiz(project_id, title, difficulty, questions)

        return jsonify({
            'quiz_id': quiz_id,
            'status': 'completed',
            'message': 'Quiz generated successfully',
            'questions': questions
        }), 201

    except Exception as e:
        return handle_error(e, "Failed to generate quiz")


# ==============================
# QUIZ ENDPOINTS
# ==============================

@app.route('/api/quizzes/<int:quiz_id>', methods=['GET'])
@require_auth
def get_quiz(quiz_id):
    try:
        user_id = get_current_user_id()

        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        return jsonify(quiz)

    except Exception as e:
        return handle_error(e, "Failed to get quiz")


@app.route('/api/quizzes/<int:quiz_id>/submit', methods=['POST'])
@require_auth
def submit_quiz(quiz_id):
    try:
        user_id = get_current_user_id()
        data = request.get_json()

        answers = data.get('answers', [])

        # Get quiz to calculate score
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Calculate score
        correct_answers = 0
        total_questions = len(quiz['questions'])
        results = []

        for i, question in enumerate(quiz['questions']):
            user_answer = None
            for answer in answers:
                if answer['question_id'] == question['id']:
                    user_answer = answer['selected_option']
                    break

            is_correct = user_answer == question.get('correct_answer', 0)
            if is_correct:
                correct_answers += 1

            results.append({
                'question_id': question['id'],
                'correct': is_correct,
                'selected_option': user_answer,
                'correct_option': question.get('correct_answer', 0),
                'explanation': question.get('explanation', '')
            })

        score = round((correct_answers / total_questions) * 100) if total_questions > 0 else 0

        # Save attempt
        quizzes_db.submit_quiz_attempt(quiz_id, user_id, answers, score)

        return jsonify({
            'score': score,
            'correct_answers': correct_answers,
            'total_questions': total_questions,
            'time_taken': 0,  # You'd track this in a real app
            'results': results
        })

    except Exception as e:
        return handle_error(e, "Failed to submit quiz")


# ==============================
# UTILITY FUNCTIONS
# ==============================

def parse_quiz_response(quiz_response, question_count, difficulty, question_types):
    """Parse the LLM response into structured questions"""
    # This is a placeholder - you'll need to implement this based on your LLM output format
    # For now, return sample questions
    questions = []

    # You could implement parsing logic here based on how your chatbot.generate_quiz_prompt returns data
    # For example, if it returns JSON, you could parse it
    # If it returns text, you'd need to extract questions, options, and answers

    return json.loads(quiz_response)['questions']


# ==============================
# ERROR HANDLERS
# ==============================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': {
            'code': 'NOT_FOUND',
            'message': 'Endpoint not found',
            'timestamp': datetime.now().isoformat()
        }
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': {
            'code': 'INTERNAL_ERROR',
            'message': 'Internal server error',
            'timestamp': datetime.now().isoformat()
        }
    }), 500


if __name__ == '__main__':
    # Create upload directories
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs('temp', exist_ok=True)

    app.run(debug=True, host='0.0.0.0', port=6888)