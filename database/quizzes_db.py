import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime
import json

load_dotenv()

def get_conn():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        dbname=os.getenv("PG_DB"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD")
    )

def create_quiz_tables():
    conn = get_conn()
    cur = conn.cursor()

    # Quizzes table
    cur.execute("""
                CREATE TABLE IF NOT EXISTS quizzes
                (
                    id             SERIAL PRIMARY KEY,
                    project_id     INTEGER      NOT NULL,
                    title          VARCHAR(200) NOT NULL,
                    difficulty     VARCHAR(20) DEFAULT 'medium',
                    question_count INTEGER      NOT NULL,
                    created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                )
                """)

    # Quiz questions table
    cur.execute("""
                CREATE TABLE IF NOT EXISTS quiz_questions
                (
                    id             SERIAL PRIMARY KEY,
                    quiz_id        INTEGER NOT NULL,
                    question_text  TEXT    NOT NULL,
                    question_type  VARCHAR(50) DEFAULT 'multiple-choice',
                    options        JSON,
                    correct_answer TEXT NOT NULL,
                    explanation    TEXT,
                    question_order INTEGER NOT NULL,
                    FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
                )
                """)

    # Quiz attempts table
    cur.execute("""
                CREATE TABLE IF NOT EXISTS quiz_attempts
                (
                    id           SERIAL PRIMARY KEY,
                    quiz_id      INTEGER       NOT NULL,
                    user_id      INTEGER       NOT NULL,
                    score        DECIMAL(5, 2) NOT NULL,
                    answers      JSON          NOT NULL,
                    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
                """)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Quiz tables created (or already existed).")

def normalize_correct_answer(correct_answer, question_type):
    """Convert correct_answer to appropriate format for database storage"""
    if question_type == 'multiple-choice' or question_type == 'true-false':
        return int(correct_answer)
    elif question_type == 'fill-in-blank':
        # Store as JSON string for arrays
        if isinstance(correct_answer, list):
            return json.dumps(correct_answer)
        return str(correct_answer)
    else:  # short-answer
        return str(correct_answer)

def create_quiz(project_id, title, difficulty, questions):
    """Create a new quiz with questions"""
    conn = get_conn()
    cur = conn.cursor()

    try:
        # Create the quiz
        cur.execute("""
                    INSERT INTO quizzes (project_id, title, difficulty, question_count)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, created_at
                    """, (project_id, title, difficulty, len(questions)))

        quiz_result = cur.fetchone()
        quiz_id, created_at = quiz_result

        # Add questions
        for i, question in enumerate(questions):
            cur.execute("""
                        INSERT INTO quiz_questions
                        (quiz_id, question_text, question_type, options, correct_answer, explanation, question_order)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """, (
                            quiz_id,
                            question['text'],
                            question.get('type', 'multiple-choice'),
                            json.dumps(question['options']) if question['options'] is not None else None,
                            normalize_correct_answer(question['correct_answer'], question.get('type', 'multiple-choice')),
                            question.get('explanation', ''),
                            i + 1
                        ))

        # Update project timestamp
        cur.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s", (project_id,))

        conn.commit()
        cur.close()
        conn.close()

        print(f"✅ Created quiz '{title}' with {len(questions)} questions")
        return {
            'id': quiz_id,
            'project_id': project_id,
            'title': title,
            'difficulty': difficulty,
            'question_count': len(questions),
            'created_at': created_at,
            'attempts': 0,
            'best_score': 0
        }

    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        raise e

def get_project_quizzes(project_id):
    """Get all quizzes for a project"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT q.id,
                       q.title,
                       q.difficulty,
                       q.question_count,
                       q.created_at,
                       COUNT(qa.id)               as attempt_count,
                       COALESCE(MAX(qa.score), 0) as best_score
                FROM quizzes q
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id
                WHERE q.project_id = %s
                GROUP BY q.id, q.title, q.difficulty, q.question_count, q.created_at
                ORDER BY q.created_at DESC
                """, (project_id,))

    quizzes = []
    for row in cur.fetchall():
        quizzes.append({
            'id': row[0],
            'title': row[1],
            'difficulty': row[2],
            'question_count': row[3],
            'created_at': row[4],
            'attempts': row[5],
            'last_score': int(row[6]) if row[6] else 0
        })

    cur.close()
    conn.close()
    return quizzes

def get_quiz_with_questions(quiz_id, user_id):
    """Get a quiz with all its questions (verify user has access)"""
    conn = get_conn()
    cur = conn.cursor()

    # First check if user has access to this quiz
    cur.execute("""
                SELECT q.id, q.project_id, q.title, q.difficulty, q.question_count, q.created_at
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                WHERE q.id = %s
                  AND p.user_id = %s
                """, (quiz_id, user_id))

    quiz_result = cur.fetchone()
    if not quiz_result:
        cur.close()
        conn.close()
        return None

    quiz_data = {
        'id': quiz_result[0],
        'project_id': quiz_result[1],
        'title': quiz_result[2],
        'difficulty': quiz_result[3],
        'question_count': quiz_result[4],
        'created_at': quiz_result[5],
        'questions': []
    }

    # Get questions
    cur.execute("""
                SELECT id, question_text, question_type, options, correct_answer, explanation, question_order
                FROM quiz_questions
                WHERE quiz_id = %s
                ORDER BY question_order
                """, (quiz_id,))

    for row in cur.fetchall():
        quiz_data['questions'].append({
            'id': row[0],
            'text': row[1],
            'type': row[2],
            'options': row[3],
            'correct_answer': row[4],
            'explanation': row[5],
            'order': row[6]
        })

    cur.close()
    conn.close()
    return quiz_data

def submit_quiz_attempt(quiz_id, user_id, answers, score):
    """Submit a quiz attempt"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                INSERT INTO quiz_attempts (quiz_id, user_id, score, answers)
                VALUES (%s, %s, %s, %s)
                RETURNING id, completed_at
                """, (quiz_id, user_id, score, json.dumps(answers)))

    result = cur.fetchone()
    attempt_id, completed_at = result

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Quiz attempt submitted - Score: {score}%")
    return {
        'id': attempt_id,
        'quiz_id': quiz_id,
        'user_id': user_id,
        'score': score,
        'completed_at': completed_at
    }

def get_quiz_attempts(quiz_id, user_id):
    """Get all attempts for a quiz by a user"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT qa.id, qa.score, qa.answers, qa.completed_at
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE qa.quiz_id = %s
                  AND qa.user_id = %s
                  AND p.user_id = %s
                ORDER BY qa.completed_at DESC
                """, (quiz_id, user_id, user_id))

    attempts = []
    for row in cur.fetchall():
        attempts.append({
            'id': row[0],
            'score': float(row[1]),
            'answers': json.loads(row[2]),
            'completed_at': row[3]
        })

    cur.close()
    conn.close()
    return attempts

def delete_quiz(quiz_id, user_id):
    """Delete a quiz (with user permission check)"""
    conn = get_conn()
    cur = conn.cursor()

    # Check if user owns this quiz through project ownership
    cur.execute("""
                SELECT q.title, q.project_id
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                WHERE q.id = %s
                  AND p.user_id = %s
                """, (quiz_id, user_id))

    result = cur.fetchone()
    if not result:
        cur.close()
        conn.close()
        return False

    quiz_title, project_id = result

    # Delete quiz (CASCADE will handle questions and attempts)
    cur.execute("DELETE FROM quizzes WHERE id = %s", (quiz_id,))

    # Update project timestamp
    cur.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s", (project_id,))

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Deleted quiz '{quiz_title}' (ID: {quiz_id})")
    return True

def get_user_quiz_analytics(user_id):
    """Get analytics for all user's quizzes"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT COUNT(DISTINCT q.id)                                                            as total_quizzes,
                       COUNT(qa.id)                                                                    as total_attempts,
                       COALESCE(AVG(qa.score), 0)                                                      as avg_score,
                       COALESCE(MAX(qa.score), 0)                                                      as best_score,
                       COUNT(CASE WHEN qa.score >= 70 THEN 1 END)                                      as passing_attempts,
                       COUNT(CASE WHEN qa.completed_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recent_attempts
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
                WHERE p.user_id = %s
                """, (user_id, user_id))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'total_quizzes': result[0],
        'total_attempts': result[1],
        'avg_score': round(float(result[2]), 2) if result[2] else 0,
        'best_score': round(float(result[3]), 2) if result[3] else 0,
        'passing_attempts': result[4],
        'recent_attempts': result[5]
    }

def get_quiz_performance_over_time(user_id, days=30):
    """Get quiz performance over time"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT DATE(qa.completed_at) as date, AVG(qa.score) as avg_score, COUNT(*) as attempts
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE p.user_id = %s
                  AND qa.completed_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE (qa.completed_at)
                ORDER BY date
                """, (user_id, days))

    performance_data = []
    for row in cur.fetchall():
        performance_data.append({
            'date': row[0],
            'avg_score': round(float(row[1]), 2),
            'attempts': row[2]
        })

    cur.close()
    conn.close()
    return performance_data

def get_difficulty_breakdown(user_id):
    """Get performance breakdown by difficulty level"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT q.difficulty,
                       COUNT(DISTINCT q.id)       as quiz_count,
                       COUNT(qa.id)               as attempt_count,
                       COALESCE(AVG(qa.score), 0) as avg_score
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
                WHERE p.user_id = %s
                GROUP BY q.difficulty
                ORDER BY CASE q.difficulty
                             WHEN 'easy' THEN 1
                             WHEN 'medium' THEN 2
                             WHEN 'hard' THEN 3
                             ELSE 4
                             END
                """, (user_id, user_id))

    difficulty_data = []
    for row in cur.fetchall():
        difficulty_data.append({
            'difficulty': row[0],
            'quiz_count': row[1],
            'attempt_count': row[2],
            'avg_score': round(float(row[3]), 2) if row[3] else 0
        })

    cur.close()
    conn.close()
    return difficulty_data

def search_quizzes(user_id, query):
    """Search quizzes by title"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT q.id,
                       q.title,
                       q.difficulty,
                       q.question_count,
                       q.created_at,
                       p.name                     as project_name,
                       COUNT(qa.id)               as attempt_count,
                       COALESCE(MAX(qa.score), 0) as best_score
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
        WHERE p.user_id = %s 
        AND LOWER(q.title) LIKE LOWER(%s)
        GROUP BY q.id, q.title, q.difficulty, q.question_count, q.created_at, p.name
        ORDER BY q.created_at DESC
    """, (user_id, user_id, f"%{query}%"))

    quizzes = []
    for row in cur.fetchall():
        quizzes.append({
            'id': row[0],
            'title': row[1],
            'difficulty': row[2],
            'question_count': row[3],
            'created_at': row[4],
            'project_name': row[5],
            'attempt_count': row[6],
            'best_score': round(float(row[7]), 2) if row[7] else 0
        })

    cur.close()
    conn.close()
    return quizzes
