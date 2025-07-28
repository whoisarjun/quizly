from flask import Flask, request, jsonify, session, send_file, render_template, redirect
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

# super secret 🤫
load_dotenv()

# server setup
app = Flask(__name__, static_folder='static')
app.config['SECRET_KEY'] = os.getenv('API_SECRET_KEY')
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB max file size
CORS(app)

# all inits
db_init.init_all_tables()
ph = PasswordHasher()
chatbot.set_model('o4-mini')
answer_validator = chatbot.AnswerValidator()

# ==============================
# UTILITY FUNCTIONS
# ==============================

# decorator func to require authentication
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': {'code': 'UNAUTHORIZED', 'message': 'Authentication required'}}), 401
        return f(*args, **kwargs)

    return decorated_function

# get current user id from whoever is running the session
def get_current_user_id():
    return session.get('user_id')

# simple error handler 💀
def handle_error(e, message="An error occurred"):
    print(f"Error: {e}")
    return jsonify({
        'error': {
            'code': 'SERVER_ERROR',
            'message': message,
            'timestamp': datetime.now().isoformat()
        }
    }), 500

# ==============================
# PAGE ROUTES
# ==============================

# home page
@app.route('/')
def home():
    if 'user_id' in session:
        return redirect('/dashboard')
    return render_template('index.html')

# login/create acc page
@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect('/dashboard')
    return render_template('sign_in.html')

# dashboard page
@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect('/login')
    return render_template('dashboard.html')

# ==============================
# AUTH ENDPOINTS
# ==============================

# log in -> dashboard
@app.route('/api/auth/login', methods=['POST'])
def login():
    session.clear()
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': 'Email and password required'}}), 400

        if users_db.user_exists(email):
            validation = users_db.validate_user(email, password)
            if validation[0]:
                user_info = validation[1]
                session['user_id'] = user_info['user_id']
                print(f'Successfully signed in {email}')
                return redirect('/dashboard')
            else:
                return jsonify({'error': {'code': 'INVALID_CREDENTIALS',
                                          'message': validation[1].get('message', 'Invalid credentials')}}), 401
        else:
            return jsonify({'error': {'code': 'INVALID_CREDENTIALS', 'message': 'Invalid email or password'}}), 401

    except Exception as e:
        return handle_error(e, "Login failed")

# log out from dashboard
@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

# create an account -> dashboard
@app.route('/api/auth/register', methods=['POST'])
def register():
    session.clear()
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

        hashed_password = ph.hash(password)
        user_id = users_db.create_new_user(first_name, last_name, email, hashed_password)
        session['user_id'] = user_id

        # Redirect to dashboard instead of returning JSON
        return redirect('/dashboard')

    except Exception as e:
        return handle_error(e, "Registration failed")

# legacy endpoints for backward compatibility
@app.route('/create_user', methods=['POST'])
def create_user():
    return register()
@app.route('/sign_in', methods=['POST'])
def sign_in():
    return login()

# ==============================
# USER PROFILE ENDPOINTS
# ==============================

# get user details
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

# get user's stats for dashboard
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

# retrieve all projects
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

# create a new project from dashboard
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

# get a project's details
@app.route('/api/projects/<int:project_id>', methods=['GET'])
@require_auth
def get_project(project_id):
    try:
        user_id = get_current_user_id()

        # make sure the user isn't accessing someone else's proj
        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        project = projects_db.get_project_by_id(project_id, user_id)
        if not project:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

        # get files and quizzes for this project
        project_files = files_db.get_project_files(project_id)
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        project['files'] = project_files
        project['quizzes'] = project_quizzes

        return jsonify(project)

    except Exception as e:
        return handle_error(e, "Failed to get project")

# update project details
@app.route('/api/projects/<int:project_id>', methods=['PUT'])
@require_auth
def update_project_api(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()

        if not name:
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': 'Project name is required'}}), 400

        # update with .db shortcut
        success = projects_db.update_project(project_id, user_id, name=name, description=description)

        if not success:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found or no changes made'}}), 404

        # return updated project data
        updated_project = projects_db.get_project_by_id(project_id, user_id)

        return jsonify(updated_project)

    except Exception as e:
        return handle_error(e, "Failed to update project")

# delete project
@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
@require_auth
def delete_project_api(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        project = projects_db.get_project_by_id(project_id, user_id)
        if not project:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

        project_files = files_db.get_project_files(project_id)

        # delete project files
        deleted_files = []
        failed_file_deletions = []

        for file_info in project_files:
            try:
                file_path = file_info.get('file_path')
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                    deleted_files.append(file_path)
                    print(f"✅ Deleted file: {file_path}")
            except Exception as file_error:
                failed_file_deletions.append({
                    'file': file_info.get('original_filename', 'unknown'),
                    'error': str(file_error)
                })
                print(f"⚠️ Could not delete file: {file_error}")

        # delete project directory if it exists and is empty
        project_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(project_id))
        try:
            if os.path.exists(project_dir):
                if not os.listdir(project_dir):  # check if directory is empty
                    os.rmdir(project_dir)
                    print(f"✅ Deleted project directory: {project_dir}")
        except Exception as dir_error:
            print(f"⚠️ Could not delete project directory: {dir_error}")

        success = projects_db.delete_project(project_id, user_id)

        if not success:
            return jsonify(
                {'error': {'code': 'DATABASE_ERROR', 'message': 'Failed to delete project from database'}}), 500

        return jsonify({
            'message': 'Project deleted successfully',
            'project_id': project_id,
            'project_name': project.get('name', 'Unknown'),
            'cleanup_summary': {
                'files_deleted': len(deleted_files),
                'files_failed': len(failed_file_deletions),
                'failed_deletions': failed_file_deletions if failed_file_deletions else None
            }
        })

    except Exception as e:
        return handle_error(e, "Failed to delete project")

# ==============================
# FILE ENDPOINTS
# ==============================

# upload file(s) to a project
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

        # create upload dir if it doesnt exist
        upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(project_id))
        os.makedirs(upload_dir, exist_ok=True)

        for file in files:
            if file.filename == '':
                continue

            try:
                # secure filename
                filename = secure_filename(file.filename)
                file_path = os.path.join(upload_dir, filename)

                # save file
                file.save(file_path)

                # add to db
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

# delete a file from a project
@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@require_auth
def delete_file(file_id):
    try:
        user_id = get_current_user_id()

        # delete from db
        success, result = files_db.delete_file(file_id, user_id)

        if not success:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': result}}), 404

        file_path = result
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"✅ Deleted file: {file_path}")
            else:
                print(f"⚠️ File not found: {file_path}")
        except Exception as file_error:
            print(f"⚠️ Could not delete file {file_path}: {file_error}")

        return jsonify({
            'message': 'File deleted successfully',
            'file_id': file_id
        })

    except Exception as e:
        return handle_error(e, "Failed to delete file")

# ==============================
# QUIZ GENERATION ENDPOINT
# ==============================

# generate a quiz!
@app.route('/api/projects/<int:project_id>/quizzes/generate', methods=['POST'])
@require_auth
def generate_quiz_from_project(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        data = request.get_json()

        title = data.get('title', f'Quiz {datetime.now().strftime("%Y-%m-%d %H:%M")}')
        difficulty = data.get('difficulty', 'medium')
        question_count = data.get('question_count', 10)
        question_types = data.get('question_types', ['multiple-choice'])

        project_files = files_db.get_project_files(project_id)

        if not project_files:
            return jsonify({'error': {'code': 'NO_FILES', 'message': 'No files found in project'}}), 400

        file_paths = [file['file_path'] for file in project_files]
        file_content = text_extractor.generate_plaintext(file_paths)

        quiz_response = chatbot.generate_quiz_prompt(file_content, specifications={
            'difficulty': difficulty,
            'questions': question_count,
            'question_types': question_types
        })

        # JUST FOR TESTING PURPOSES:
        # with open('temp/test.txt', 'w') as f:
        #     f.write(quiz_response)

        # parse response
        questions = parse_quiz_response(quiz_response, question_count, difficulty, question_types)

        # create quiz in db
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

# retrieve quiz
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

# retrieve quiz attempt details
@app.route('/api/quiz-attempts/<int:attempt_id>', methods=['GET'])
@require_auth
def get_quiz_attempt_details(attempt_id):
    try:
        user_id = get_current_user_id()

        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        return jsonify(attempt)

    except Exception as e:
        return handle_error(e, "Failed to get quiz attempt details")

# get analytics on performance for a quiz
@app.route('/api/quizzes/<int:quiz_id>/analytics', methods=['GET'])
@require_auth
def get_quiz_analytics_api(quiz_id):
    try:
        user_id = get_current_user_id()

        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        analytics = quizzes_db.get_quiz_attempt_analytics(quiz_id, user_id)

        # fallback in case something goes wrong
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

# get all quiz attempts for a project
@app.route('/api/projects/<int:project_id>/quiz-attempts', methods=['GET'])
@require_auth
def get_project_quiz_attempts(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        all_attempts = []
        for quiz in project_quizzes:
            attempts = quizzes_db.get_quiz_attempts_history(quiz['id'], user_id)
            for attempt in attempts:
                attempt['quiz_title'] = quiz['title']
                attempt['quiz_id'] = quiz['id']
            all_attempts.extend(attempts)

        # sort by submission date (latest first)
        all_attempts.sort(key=lambda x: x['submitted_at'], reverse=True)

        return jsonify({
            'attempts': all_attempts,
            'total_count': len(all_attempts)
        })

    except Exception as e:
        return handle_error(e, "Failed to get project quiz attempts")

# delete a quiz
@app.route('/api/quizzes/<int:quiz_id>', methods=['DELETE'])
@require_auth
def delete_quiz_api(quiz_id):
    try:
        user_id = get_current_user_id()

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

# get detailed quiz stats for a specific project
@app.route('/api/projects/<int:project_id>/stats', methods=['GET'])
@require_auth
def get_project_stats_detailed(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        # get all quizzes for this project
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        quiz_stats = []
        for quiz in project_quizzes:
            # get attempts for this quiz
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

# get analytics for all quizzes in a project
@app.route('/api/projects/<int:project_id>/analytics', methods=['GET'])
@require_auth
def get_project_analytics_api(project_id):
    try:
        user_id = get_current_user_id()

        if not db_utils.verify_project_ownership(project_id, user_id):
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

        # get all quizzes for this project
        project_quizzes = quizzes_db.get_project_quizzes(project_id)

        analytics_data = {
            'project_id': project_id,
            'total_quizzes': len(project_quizzes),
            'quiz_analytics': []
        }

        # get analytics for each quiz
        for quiz in project_quizzes:
            quiz_analytics = quizzes_db.get_quiz_attempt_analytics(quiz['id'], user_id)
            if quiz_analytics:
                quiz_analytics['quiz_title'] = quiz['title']
                quiz_analytics['quiz_difficulty'] = quiz['difficulty']
                analytics_data['quiz_analytics'].append(quiz_analytics)

        # calculate project-wide statistics
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

# submit a quiz for validation
@app.route('/api/quizzes/<int:quiz_id>/submit', methods=['POST'])
@require_auth
def submit_quiz(quiz_id):
    try:
        user_id = get_current_user_id()
        data = request.get_json()

        answers = data.get('answers', [])
        use_llm_validation = data.get('use_llm_validation', True)

        # get quiz with questions
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # get project files for LLM validation
        project_files = files_db.get_project_files(quiz['project_id'])

        validation_results = None

        if use_llm_validation and project_files:
            # use LLM validation
            print("🤖 Using LLM-based answer validation...")

            # format answers for validation
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

            # get LLM validation
            validation_results = answer_validator.validate_quiz_answers(
                project_files=project_files,
                questions=quiz['questions'],
                student_answers=formatted_answers
            )

            if not validation_results.get('error'):
                # use LLM results
                score = validation_results['overall_score']
                correct_answers = validation_results['correct_answers']
                results = validation_results['validation_results']

                # save attempt with detailed results
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

            # find the user's answer for this question
            for answer in answers:
                if answer['question_id'] == question['id']:
                    user_answer = answer.get('selected_option')
                    user_answer_text = answer.get('answer_text', '')
                    user_fill_answers = answer.get('fill_in_answers', [])
                    break

            is_correct = False
            score_percentage = 0
            feedback = ""

            # validate based on question type
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
                # for short answers without LLM, give partial credit if answered
                if user_answer_text.strip():
                    score_percentage = 75  # give partial credit
                    feedback = "Answer provided. Full validation requires manual review."
                else:
                    feedback = "No answer provided."

            elif question['type'] == 'fill-in-blank':
                # for fill-in-blank without LLM, give partial credit if any blanks filled
                if user_fill_answers and any(ans.strip() for ans in user_fill_answers):
                    score_percentage = 75  # give partial credit
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

        # calculate overall score as average of individual question scores
        score = round(sum(individual_scores) / len(individual_scores)) if individual_scores else 0

        # calculate correct answers for display purposes
        correct_answers = sum(1 for s in individual_scores if s >= 100)
        total_correct_equivalent = correct_answers + (sum(s for s in individual_scores if 0 < s < 100) / 100)

        # save attempt
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

# get all attempts for a specific quiz by the current user
@app.route('/api/quizzes/<int:quiz_id>/attempts', methods=['GET'])
@require_auth
def get_quiz_attempts_api(quiz_id):
    try:
        user_id = get_current_user_id()

        # verify user has access to this quiz
        quiz = quizzes_db.get_quiz_with_questions(quiz_id, user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # get attempts history
        attempts = quizzes_db.get_quiz_attempts_history(quiz_id, user_id, limit=50)

        return jsonify({
            'attempts': attempts,
            'quiz_id': quiz_id,
            'quiz_title': quiz['title'],
            'total_count': len(attempts)
        })

    except Exception as e:
        return handle_error(e, "Failed to get quiz attempts")

# revalidate a quiz attempt for enhanced feedback
@app.route('/api/quiz-attempts/<int:attempt_id>/revalidate', methods=['POST'])
@require_auth
def revalidate_quiz_attempt(attempt_id):
    try:
        user_id = get_current_user_id()

        # get attempt
        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        # get quiz with questions
        quiz = quizzes_db.get_quiz_with_questions(attempt['quiz_id'], user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # get project files for LLM validation
        project_files = files_db.get_project_files(attempt['project_id'])

        if not project_files:
            return jsonify({'error': {'code': 'NO_FILES', 'message': 'No project files available for validation'}}), 400

        print(f"🤖 Re-validating attempt {attempt_id} with LLM...")

        # format answers for validation
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

        # get LLM validation
        validation_results = answer_validator.validate_quiz_answers(
            project_files=project_files,
            questions=quiz['questions'],
            student_answers=formatted_answers
        )

        if validation_results.get('error'):
            return jsonify({'error': {'code': 'VALIDATION_ERROR', 'message': validation_results['error']}}), 500

        # update the attempt with new results
        new_score = validation_results['overall_score']
        old_score = attempt['score']

        # update in database
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

# export detailed quiz attempt results
@app.route('/api/quiz-attempts/<int:attempt_id>/export', methods=['GET'])
@require_auth
def export_quiz_attempt(attempt_id):
    try:
        user_id = get_current_user_id()

        # get attempt with all details
        attempt = quizzes_db.get_quiz_attempt(attempt_id, user_id)
        if not attempt:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz attempt not found'}}), 404

        # get the quiz details
        quiz = quizzes_db.get_quiz_with_questions(attempt['quiz_id'], user_id)
        if not quiz:
            return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Quiz not found'}}), 404

        # create comprehensive export data
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

        # add detailed feedback if its available
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

# get comprehensive quiz stats for current user
@app.route('/api/user/quiz-statistics', methods=['GET'])
@require_auth
def get_user_quiz_statistics_api():
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

# used to be more complex but its simpler now
def parse_quiz_response(quiz_response, question_count, difficulty, question_types):
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
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs('temp', exist_ok=True)

    app.run(debug=True, host='0.0.0.0', port=6900)