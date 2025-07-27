from flask import Flask, request, jsonify, session, send_file, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
from argon2 import PasswordHasher
import os
from datetime import datetime
import json
from functools import wraps
from database import db_init, db_utils, files_db, projects_db, quizzes_db, users_db
from file_manager import text_extractor
from llm import chatbot
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static')
app.config['SECRET_KEY'] = os.getenv('API_SECRET_KEY')
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB max file size

CORS(app)  # Enable CORS for frontend

# Initialize database and password hasher
db_init.init_all_tables()
ph = PasswordHasher()
chatbot.set_model('gpt-4.1-nano')
answer_validator = chatbot.AnswerValidator()

# ==============================
# TO-DO LIST
# ==============================

# TODO: Delete quizzes

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
    session.clear()  # wipe any existing session data
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
    session.clear()  # wipe any existing session data
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


@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@require_auth
def delete_file(file_id):
    try:
        user_id = get_current_user_id()

        # Delete from database (this also checks user permission)
        success, result = files_db.delete_file(file_id, user_id)

        if not success:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': result}}), 404

        # result is the file_path, now delete the actual file from disk
        file_path = result
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"✅ Deleted file: {file_path}")
            else:
                print(f"⚠️ File not found: {file_path}")
        except Exception as file_error:
            print(f"⚠️ Could not delete file {file_path}: {file_error}")
            # Don't fail the API call if physical file deletion fails

        return jsonify({
            'message': 'File deleted successfully',
            'file_id': file_id
        })

    except Exception as e:
        return handle_error(e, "Failed to delete file")

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

@app.route('/api/quiz-attempts/<int:attempt_id>', methods=['GET'])
@require_auth
def get_quiz_attempt_details(attempt_id):
    """Get detailed information about a specific quiz attempt"""
    try:
        user_id = get_current_user_id()

        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        return jsonify(attempt)

    except Exception as e:
        return handle_error(e, "Failed to get quiz attempt details")

@app.route('/api/quizzes/<int:quiz_id>/analytics', methods=['GET'])
@require_auth
def get_quiz_analytics_api(quiz_id):
    """Get comprehensive analytics for a specific quiz"""
    try:
        user_id = get_current_user_id()

        # Verify user has access to this quiz
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Get quiz attempt analytics
        analytics = quizzes_db.get_quiz_attempt_analytics(quiz_id, user_id)

        if not analytics:
            return jsonify({
                'total_attempts': 0,
                'avg_score': 0,
                'best_score': 0,
                'worst_score': 0,
                'improvement': 0,
                'improvement_trend': 0,
                'consistency_score': 100,
                'recent_scores': [],
                'detailed_attempts': 0,
                'message': 'No attempts yet'
            })

        return jsonify(analytics)

    except Exception as e:
        return handle_error(e, "Failed to get quiz analytics")

@app.route('/api/projects/<int:project_id>/quiz-attempts', methods=['GET'])
@require_auth
def get_project_quiz_attempts(project_id):
    """Get all quiz attempts for a project"""
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        # Get all quizzes for this project
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        all_attempts = []
        for quiz in project_quizzes:
            attempts = quizzes_db.get_quiz_attempts_history(quiz['id'], user_id)
            for attempt in attempts:
                attempt['quiz_title'] = quiz['title']
                attempt['quiz_id'] = quiz['id']
            all_attempts.extend(attempts)

        # Sort by submission date (most recent first)
        all_attempts.sort(key=lambda x: x['submitted_at'], reverse=True)

        return jsonify({
            'attempts': all_attempts,
            'total_count': len(all_attempts)
        })

    except Exception as e:
        return handle_error(e, "Failed to get project quiz attempts")

@app.route('/api/quizzes/<int:quiz_id>', methods=['DELETE'])
@require_auth
def delete_quiz_api(quiz_id):
    """Delete a quiz"""
    try:
        user_id = get_current_user_id()

        # Delete the quiz (function checks user permission)
        success = quizzes_db.delete_quiz(quiz_id, user_id)

        if not success:
            return jsonify({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Quiz not found or access denied'
                }
            }), 404

        return jsonify({
            'message': 'Quiz deleted successfully',
            'quiz_id': quiz_id
        })

    except Exception as e:
        return handle_error(e, "Failed to delete quiz")

@app.route('/api/projects/<int:project_id>/stats', methods=['GET'])
@require_auth
def get_project_stats_detailed(project_id):
    """Get detailed quiz statistics for a specific project"""
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        # Get all quizzes for this project
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        quiz_stats = []
        for quiz in project_quizzes:
            # Get attempts for this quiz
            attempts = quizzes_db.get_quiz_attempts_history(quiz['id'], user_id)

            if attempts:
                scores = [attempt['score'] for attempt in attempts]
                quiz_stat = {
                    "quiz_id": quiz['id'],
                    "attempt_count": len(attempts),
                    "best_score": max(scores),
                    "avg_score": round(sum(scores) / len(scores), 1),
                    "last_attempt": attempts[0]['submitted_at'].isoformat() if attempts[0]['submitted_at'] else None
                }
            else:
                quiz_stat = {
                    "quiz_id": quiz['id'],
                    "attempt_count": 0,
                    "best_score": 0,
                    "avg_score": 0,
                    "last_attempt": None
                }

            quiz_stats.append(quiz_stat)

        return jsonify({
            "quizzes": quiz_stats
        })

    except Exception as e:
        return handle_error(e, "Failed to get project stats")

@app.route('/api/projects/<int:project_id>/analytics', methods=['GET'])
@require_auth
def get_project_analytics_api(project_id):
    """Get analytics for all quizzes in a project"""
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        # Get all quizzes for this project
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        analytics_data = {
            'project_id': project_id,
            'total_quizzes': len(project_quizzes),
            'quiz_analytics': []
        }

        # Get analytics for each quiz
        for quiz in project_quizzes:
            quiz_analytics = quizzes_db.get_quiz_attempt_analytics(quiz['id'], user_id)
            if quiz_analytics:
                quiz_analytics['quiz_title'] = quiz['title']
                quiz_analytics['quiz_difficulty'] = quiz['difficulty']
                analytics_data['quiz_analytics'].append(quiz_analytics)

        # Calculate project-wide statistics
        if analytics_data['quiz_analytics']:
            total_attempts = sum(qa['total_attempts'] for qa in analytics_data['quiz_analytics'])
            avg_scores = [qa['avg_score'] for qa in analytics_data['quiz_analytics'] if qa['avg_score'] > 0]
            best_scores = [qa['best_score'] for qa in analytics_data['quiz_analytics'] if qa['best_score'] > 0]

            analytics_data.update({
                'total_attempts': total_attempts,
                'overall_avg_score': sum(avg_scores) / len(avg_scores) if avg_scores else 0,
                'overall_best_score': max(best_scores) if best_scores else 0,
                'active_quizzes': len([qa for qa in analytics_data['quiz_analytics'] if qa['total_attempts'] > 0])
            })
        else:
            analytics_data.update({
                'total_attempts': 0,
                'overall_avg_score': 0,
                'overall_best_score': 0,
                'active_quizzes': 0
            })

        return jsonify(analytics_data)

    except Exception as e:
        return handle_error(e, "Failed to get project analytics")(
            {'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        # Get the quiz details
        quiz = quizzes_db.get_quiz_with_questions(attempt['quiz_id'], user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Create comprehensive export data
        export_data = {
            'attempt_info': {
                'id': attempt['id'],
                'submitted_at': attempt['submitted_at'].isoformat() if attempt['submitted_at'] else None,
                'score': attempt['score'],
                'quiz_title': attempt['quiz_title'],
                'revalidated_at': attempt.get('revalidated_at')
            },
            'quiz_info': {
                'title': quiz['title'],
                'difficulty': quiz['difficulty'],
                'question_count': quiz['question_count']
            },
            'answers': attempt['answers'],
            'validation_results': attempt['validation_results'],
            'detailed_feedback': []
        }

        # Add detailed feedback if available
        if attempt['validation_results'] and attempt['validation_results'].get('validation_results'):
            for result in attempt['validation_results']['validation_results']:
                question = next((q for q in quiz['questions'] if q['id'] == result['question_id']), None)
                if question:
                    feedback_item = {
                        'question_id': result['question_id'],
                        'question_text': question['text'],
                        'question_type': question['type'],
                        'student_answer': result.get('student_answer', ''),
                        'score_percentage': result.get('score_percentage', 0),
                        'is_correct': result.get('is_correct', False),
                        'feedback': result.get('feedback', ''),
                        'partial_credit_details': result.get('partial_credit_details', '')
                    }
                    export_data['detailed_feedback'].append(feedback_item)

        return jsonify(export_data)

    except Exception as e:
        return handle_error(e, "Failed to export quiz attempt")

@app.route('/api/quizzes/<int:quiz_id>/submit', methods=['POST'])
@require_auth
def submit_quiz(quiz_id):
    try:
        user_id = get_current_user_id()
        data = request.get_json()

        answers = data.get('answers', [])
        use_llm_validation = data.get('use_llm_validation', True)  # Allow override

        # Get quiz with questions
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Get project files for LLM validation
        project_files = files_db.get_project_files(quiz['project_id'])

        validation_results = None

        if use_llm_validation and project_files:
            # Use LLM validation
            print("🤖 Using LLM-based answer validation...")

            # Format answers for validation
            formatted_answers = []
            for answer in answers:
                question = next((q for q in quiz['questions'] if q['id'] == answer['question_id']), None)
                if question:
                    formatted_answer = {
                        'question_id': answer['question_id'],
                        'selected_option': answer.get('selected_option'),
                        'answer_text': answer.get('answer_text', ''),
                        'fill_in_answers': answer.get('fill_in_answers', [])
                    }
                    formatted_answers.append(formatted_answer)

            # Get LLM validation
            validation_results = answer_validator.validate_quiz_answers(
                project_files=project_files,
                questions=quiz['questions'],
                student_answers=formatted_answers
            )

            if not validation_results.get('error'):
                # Use LLM results
                score = validation_results['overall_score']
                correct_answers = validation_results['correct_answers']
                results = validation_results['validation_results']

                # Save attempt with detailed results
                attempt_id = quizzes_db.submit_quiz_attempt_with_validation(
                    quiz_id, user_id, answers, score, validation_results
                )

                return jsonify({
                    'score': score,
                    'correct_answers': correct_answers,
                    'total_questions': len(quiz['questions']),
                    'time_taken': data.get('time_taken', 0),
                    'results': results,
                    'validation_method': 'llm',
                    'attempt_id': attempt_id,
                    'detailed_feedback': True
                })

        individual_scores = []
        total_questions = len(quiz['questions'])
        results = []

        for i, question in enumerate(quiz['questions']):
            user_answer = None
            user_answer_text = ""

            # Find the user's answer for this question
            for answer in answers:
                if answer['question_id'] == question['id']:
                    user_answer = answer.get('selected_option')
                    user_answer_text = answer.get('answer_text', '')
                    user_fill_answers = answer.get('fill_in_answers', [])
                    break

            is_correct = False
            score_percentage = 0
            feedback = ""

            # Validate based on question type
            if question['type'] in ['multiple-choice', 'true-false']:
                expected_answer = question.get('correct_answer', 0)
                is_correct = (user_answer == expected_answer)
                score_percentage = 100 if is_correct else 0

                if is_correct:
                    feedback = "Correct answer!"
                else:
                    correct_option = "True" if expected_answer == 0 else "False" if question[
                                                                                        'type'] == 'true-false' else f"Option {expected_answer}"
                    feedback = f"Incorrect. The correct answer is: {correct_option}"

            elif question['type'] == 'short-answer':
                # For short answers without LLM, give partial credit if answered
                if user_answer_text.strip():
                    score_percentage = 75  # Give partial credit
                    feedback = "Answer provided. Full validation requires manual review."
                else:
                    feedback = "No answer provided."

            elif question['type'] == 'fill-in-blank':
                # For fill-in-blank without LLM, give partial credit if any blanks filled
                if user_fill_answers and any(ans.strip() for ans in user_fill_answers):
                    score_percentage = 75  # Give partial credit
                    feedback = "Answer provided. Full validation requires manual review."
                else:
                    feedback = "No answer provided."

            individual_scores.append(score_percentage)

            results.append({
                'question_id': question['id'],
                'correct': is_correct,
                'score_percentage': score_percentage,
                'selected_option': user_answer,
                'answer_text': user_answer_text,
                'correct_option': question.get('correct_answer', 0),
                'explanation': question.get('explanation', ''),
                'feedback': feedback
            })

        # Calculate overall score as average of individual question scores
        score = round(sum(individual_scores) / len(individual_scores)) if individual_scores else 0

        # Calculate correct answers for display purposes
        correct_answers = sum(1 for s in individual_scores if s >= 100)
        total_correct_equivalent = correct_answers + (sum(s for s in individual_scores if 0 < s < 100) / 100)

        # Save attempt
        attempt_id = quizzes_db.submit_quiz_attempt(quiz_id, user_id, answers, score)

        return jsonify({
            'score': score,
            'correct_answers': int(total_correct_equivalent),
            'total_questions': total_questions,
            'time_taken': data.get('time_taken', 0),
            'results': results,
            'validation_method': 'traditional',
            'attempt_id': attempt_id,
            'detailed_feedback': validation_results is None
        })

    except Exception as e:
        return handle_error(e, "Failed to submit quiz")


@app.route('/api/quizzes/<int:quiz_id>/attempts', methods=['GET'])
@require_auth
def get_quiz_attempts_api(quiz_id):
    """Get all attempts for a specific quiz by the current user"""
    try:
        user_id = get_current_user_id()

        # Verify user has access to this quiz
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Get attempts history
        attempts = quizzes_db.get_quiz_attempts_history(quiz_id, user_id, limit=50)

        return jsonify({
            'attempts': attempts,
            'quiz_id': quiz_id,
            'quiz_title': quiz['title'],
            'total_count': len(attempts)
        })

    except Exception as e:
        return handle_error(e, "Failed to get quiz attempts")


@app.route('/api/quiz-attempts/<int:attempt_id>/revalidate', methods=['POST'])
@require_auth
def revalidate_quiz_attempt(attempt_id):
    """Re-validate a quiz attempt using LLM for enhanced feedback"""
    try:
        user_id = get_current_user_id()

        # Get the attempt
        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        # Get the quiz with questions
        quiz = quizzes_db.get_quiz_with_questions(attempt['quiz_id'], user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Get project files for LLM validation
        project_files = files_db.get_project_files(attempt['project_id'])

        if not project_files:
            return jsonify({'error': {'code': 'NO_FILES', 'message': 'No project files available for validation'}}), 400

        print(f"🤖 Re-validating attempt {attempt_id} with LLM...")

        # Format answers for validation
        formatted_answers = []
        for answer in attempt['answers']:
            question = next((q for q in quiz['questions'] if q['id'] == answer['question_id']), None)
            if question:
                formatted_answer = {
                    'question_id': answer['question_id'],
                    'selected_option': answer.get('selected_option'),
                    'answer_text': answer.get('answer_text', ''),
                    'fill_in_answers': answer.get('fill_in_answers', [])
                }
                formatted_answers.append(formatted_answer)

        # Get LLM validation
        validation_results = answer_validator.validate_quiz_answers(
            project_files=project_files,
            questions=quiz['questions'],
            student_answers=formatted_answers
        )

        if validation_results.get('error'):
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': validation_results['error']}}), 500

        # Update the attempt with new results
        new_score = validation_results['overall_score']
        old_score = attempt['score']

        # Update in database
        updated = quizzes_db.update_quiz_attempt_score(attempt_id, new_score, validation_results)

        if not updated:
            return jsonify({'error': {'code': 'UPDATE_FAILED', 'message': 'Failed to update attempt'}}), 500

        print(f"✅ Re-validation complete - Score changed from {old_score}% to {new_score}%")

        return jsonify({
            'attempt_id': attempt_id,
            'old_score': old_score,
            'new_score': new_score,
            'score_difference': new_score - old_score,
            'validation_results': validation_results,
            'validation_method': 'llm',
            'revalidated_at': datetime.now().isoformat()
        })

    except Exception as e:
        return handle_error(e, "Failed to re-validate quiz attempt")

@app.route('/api/quiz-attempts/<int:attempt_id>/export', methods=['GET'])
@require_auth
def export_quiz_attempt(attempt_id):
    """Export detailed quiz attempt results"""
    try:
        user_id = get_current_user_id()

        # Get the attempt with all details
        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        # Get the quiz details
        quiz = quizzes_db.get_quiz_with_questions(attempt['quiz_id'], user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # Create comprehensive export data
        export_data = {
            'attempt_info': {
                'id': attempt['id'],
                'submitted_at': attempt['submitted_at'].isoformat() if attempt['submitted_at'] else None,
                'score': attempt['score'],
                'quiz_title': attempt['quiz_title'],
                'revalidated_at': attempt.get('revalidated_at')
            },
            'quiz_info': {
                'title': quiz['title'],
                'difficulty': quiz['difficulty'],
                'question_count': quiz['question_count']
            },
            'answers': attempt['answers'],
            'validation_results': attempt['validation_results'],
            'detailed_feedback': []
        }

        # Add detailed feedback if available
        if attempt['validation_results'] and attempt['validation_results'].get('validation_results'):
            for result in attempt['validation_results']['validation_results']:
                question = next((q for q in quiz['questions'] if q['id'] == result['question_id']), None)
                if question:
                    feedback_item = {
                        'question_id': result['question_id'],
                        'question_text': question['text'],
                        'question_type': question['type'],
                        'student_answer': result.get('student_answer', ''),
                        'score_percentage': result.get('score_percentage', 0),
                        'is_correct': result.get('is_correct', False),
                        'feedback': result.get('feedback', ''),
                        'partial_credit_details': result.get('partial_credit_details', '')
                    }
                    export_data['detailed_feedback'].append(feedback_item)

        return jsonify(export_data)

    except Exception as e:
        return handle_error(e, "Failed to export quiz attempt")


@app.route('/api/user/quiz-statistics', methods=['GET'])
@require_auth
def get_user_quiz_statistics_api():
    """Get comprehensive quiz statistics for the current user"""
    try:
        user_id = get_current_user_id()
        days = request.args.get('days', 30, type=int)

        statistics = quizzes_db.get_user_quiz_statistics(user_id, days)

        return jsonify(statistics)

    except Exception as e:
        return handle_error(e, "Failed to get user quiz statistics")

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