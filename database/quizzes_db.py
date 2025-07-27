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
                    id                 SERIAL PRIMARY KEY,
                    quiz_id            INTEGER NOT NULL,
                    user_id            INTEGER NOT NULL,
                    score              INTEGER NOT NULL,
                    submitted_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    answers            JSONB,
                    validation_results JSONB,
                    revalidated_at     TIMESTAMP,
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
                RETURNING id, submitted_at
                """, (quiz_id, user_id, score, json.dumps(answers)))

    result = cur.fetchone()
    attempt_id, submitted_at = result

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Quiz attempt submitted - Score: {score}%")
    return {
        'id': attempt_id,
        'quiz_id': quiz_id,
        'user_id': user_id,
        'score': score,
        'submitted_at': submitted_at
    }

def submit_quiz_attempt_with_validation(quiz_id, user_id, answers, score, validation_results):
    """
    Submit a quiz attempt with detailed LLM validation results
    """
    conn = get_conn()
    cur = conn.cursor()

    try:
        # Insert the basic attempt
        cur.execute("""
                    INSERT INTO quiz_attempts (quiz_id, user_id, score, submitted_at, answers, validation_results)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s)
                    RETURNING id
                    """, (quiz_id, user_id, score, json.dumps(answers), json.dumps(validation_results)))

        attempt_id = cur.fetchone()[0]

        conn.commit()
        print(f"✅ Quiz attempt {attempt_id} saved with LLM validation")
        return attempt_id

    except Exception as e:
        conn.rollback()
        print(f"❌ Error saving quiz attempt: {e}")
        raise e
    finally:
        cur.close()
        conn.close()

def get_question_performance_analytics(quiz_id, user_id):
    """Get performance analytics at the question level"""
    conn = get_conn()
    cur = conn.cursor()

    # Get question performance data
    cur.execute("""
                SELECT qq.id        as question_id,
                       qq.question_text,
                       qq.question_type,
                       COUNT(qa.id) as times_attempted,
                       AVG(
                               CASE
                                   WHEN qa.validation_results IS NOT NULL THEN
                                       CAST(qa.validation_results -> 'validation_results' -> 0 ->> 'score_percentage' AS FLOAT)
                                   ELSE
                                       CASE WHEN qa.score >= 70 THEN 100 ELSE 0 END
                                   END
                       )            as avg_score
                FROM quiz_questions qq
                         JOIN quizzes q ON qq.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
                WHERE qq.quiz_id = %s
                  AND p.user_id = %s
                GROUP BY qq.id, qq.question_text, qq.question_type
                ORDER BY qq.question_order
                """, (user_id, quiz_id, user_id))

    question_analytics = []
    for row in cur.fetchall():
        question_analytics.append({
            'question_id': row[0],
            'question_text': row[1][:100] + ('...' if len(row[1]) > 100 else ''),  # Truncate for display
            'question_type': row[2],
            'times_attempted': row[3] or 0,
            'avg_score': round(float(row[4]), 2) if row[4] else 0,
            'difficulty_rating': 'Easy' if (row[4] or 0) >= 80 else 'Medium' if (row[4] or 0) >= 60 else 'Hard'
        })

    cur.close()
    conn.close()
    return question_analytics

def get_quiz_attempt(attempt_id, user_id):
    """Get a specific quiz attempt with all details"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                SELECT qa.id,
                       qa.quiz_id,
                       qa.user_id,
                       qa.score,
                       qa.submitted_at,
                       qa.answers,
                       qa.validation_results,
                       q.title,
                       q.project_id
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                WHERE qa.id = %s
                  AND qa.user_id = %s
                """, (attempt_id, user_id))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'id': result[0],
        'quiz_id': result[1],
        'user_id': result[2],
        'score': result[3],
        'submitted_at': result[4],
        'answers': result[5] if result[5] else [],
        'validation_results': result[6] if result[6] else None,
        'quiz_title': result[7],
        'project_id': result[8]
    }

def get_quiz_attempt_analytics(quiz_id, user_id):
    """Get analytics for a specific quiz's attempts by a user"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                SELECT COUNT(*)                                                   as total_attempts,
                       AVG(score)                                                 as avg_score,
                       MAX(score)                                                 as best_score,
                       MIN(score)                                                 as worst_score,
                       MAX(submitted_at)                                          as last_attempt,
                       COUNT(CASE WHEN validation_results IS NOT NULL THEN 1 END) as detailed_attempts
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE qa.quiz_id = %s
                  AND qa.user_id = %s
                  AND p.user_id = %s
                """, (quiz_id, user_id, user_id))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result or result[0] == 0:
        return None

    return {
        'total_attempts': result[0],
        'avg_score': round(float(result[1]), 2) if result[1] else 0,
        'best_score': round(float(result[2]), 2) if result[2] else 0,
        'worst_score': round(float(result[3]), 2) if result[3] else 0,
        'last_attempt': result[4],
        'detailed_attempts': result[5],
        'improvement': round(float(result[2]) - float(result[3]), 2) if result[2] and result[3] else 0
    }

def get_quiz_attempts(quiz_id, user_id):
    """Get all attempts for a quiz by a user"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT qa.id, qa.score, qa.answers, qa.submitted_at
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE qa.quiz_id = %s
                  AND qa.user_id = %s
                  AND p.user_id = %s
                ORDER BY qa.submitted_at DESC
                """, (quiz_id, user_id, user_id))

    attempts = []
    for row in cur.fetchall():
        attempts.append({
            'id': row[0],
            'score': float(row[1]),
            'answers': row[2],
            'submitted_at': row[3]
        })

    cur.close()
    conn.close()
    return attempts

def get_quiz_attempts_with_details(quiz_id, user_id, limit=50):
    """Get quiz attempts with enhanced details including validation info"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                SELECT qa.id,
                       qa.score,
                       qa.submitted_at,
                       qa.validation_results,
                       qa.revalidated_at,
                       qa.answers,
                       CASE
                           WHEN qa.validation_results IS NOT NULL THEN true
                           ELSE false
                           END as has_detailed_feedback,
                       CASE
                           WHEN qa.validation_results ->> 'validation_method' = 'llm' THEN true
                           ELSE false
                           END as is_llm_validated
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE qa.quiz_id = %s
                  AND qa.user_id = %s
                  AND p.user_id = %s
                ORDER BY qa.submitted_at DESC
                LIMIT %s
                """, (quiz_id, user_id, user_id, limit))

    attempts = []
    for row in cur.fetchall():
        attempts.append({
            'id': row[0],
            'score': row[1],
            'submitted_at': row[2],
            'validation_results': row[3] if row[3] else None,
            'revalidated_at': row[4],
            'answers': row[5] if row[5] else [],
            'has_detailed_feedback': row[6],
            'is_llm_validated': row[7]
        })

    cur.close()
    conn.close()
    return attempts

def get_quiz_attempts_history(quiz_id, user_id, limit=10):
    """Get quiz attempt history for a specific user and quiz"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                SELECT id, score, submitted_at, validation_results, revalidated_at
                FROM quiz_attempts
                WHERE quiz_id = %s
                  AND user_id = %s
                ORDER BY submitted_at DESC
                LIMIT %s
                """, (quiz_id, user_id, limit))

    attempts = []
    for row in cur.fetchall():
        attempts.append({
            'id': row[0],
            'score': row[1],
            'submitted_at': row[2],
            'validation_results': row[3] if row[3] else None,
            'revalidated_at': row[4],
            'has_detailed_feedback': row[3] is not None
        })

    cur.close()
    conn.close()
    return attempts

def update_quiz_attempt_score(attempt_id, new_score, validation_results):
    """Update a quiz attempt with new score and validation results"""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                UPDATE quiz_attempts
                SET score              = %s,
                    validation_results = %s,
                    revalidated_at     = CURRENT_TIMESTAMP
                WHERE id = %s
                """, (new_score, json.dumps(validation_results), attempt_id))

    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    return updated

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
                       COUNT(CASE WHEN qa.submitted_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recent_attempts
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

def get_user_quiz_statistics(user_id, days=30):
    """Get comprehensive quiz statistics for a user"""
    conn = get_conn()
    cur = conn.cursor()

    # Get overall stats
    cur.execute("""
                SELECT COUNT(DISTINCT q.id)                                                             as total_quizzes,
                       COUNT(qa.id)                                                                     as total_attempts,
                       AVG(qa.score)                                                                    as avg_score,
                       MAX(qa.score)                                                                    as best_score,
                       COUNT(CASE WHEN qa.score >= 70 THEN 1 END)                                       as passing_attempts,
                       COUNT(CASE WHEN qa.submitted_at >= CURRENT_DATE - INTERVAL '%s days' THEN 1 END) as recent_attempts,
                       COUNT(CASE WHEN qa.validation_results IS NOT NULL THEN 1 END)                    as llm_validated_attempts
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
                WHERE p.user_id = %s
                """, (days, user_id, user_id))

    stats = cur.fetchone()

    # Get performance by difficulty
    cur.execute("""
                SELECT q.difficulty,
                       COUNT(qa.id)  as attempts,
                       AVG(qa.score) as avg_score,
                       MAX(qa.score) as best_score
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.user_id = %s
                WHERE p.user_id = %s
                GROUP BY q.difficulty
                ORDER BY CASE q.difficulty
                             WHEN 'easy' THEN 1
                             WHEN 'medium' THEN 2
                             WHEN 'hard' THEN 3
                             WHEN 'extreme' THEN 4
                             ELSE 5
                             END
                """, (user_id, user_id))

    difficulty_stats = []
    for row in cur.fetchall():
        difficulty_stats.append({
            'difficulty': row[0],
            'attempts': row[1] or 0,
            'avg_score': round(float(row[2]), 2) if row[2] else 0,
            'best_score': round(float(row[3]), 2) if row[3] else 0
        })

    # Get recent performance trend
    cur.execute("""
                SELECT DATE(qa.submitted_at) as date,
                       AVG(qa.score)         as avg_score,
                       COUNT(*)              as attempts
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE p.user_id = %s
                  AND qa.submitted_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE (qa.submitted_at)
                ORDER BY date DESC
                LIMIT 10
                """, (user_id, days))

    performance_trend = []
    for row in cur.fetchall():
        performance_trend.append({
            'date': row[0].isoformat(),
            'avg_score': round(float(row[1]), 2),
            'attempts': row[2]
        })

    cur.close()
    conn.close()

    return {
        'total_quizzes': stats[0] or 0,
        'total_attempts': stats[1] or 0,
        'avg_score': round(float(stats[2]), 2) if stats[2] else 0,
        'best_score': round(float(stats[3]), 2) if stats[3] else 0,
        'passing_attempts': stats[4] or 0,
        'recent_attempts': stats[5] or 0,
        'llm_validated_attempts': stats[6] or 0,
        'difficulty_breakdown': difficulty_stats,
        'performance_trend': performance_trend
    }

def get_quiz_performance_over_time(user_id, days=30):
    """Get quiz performance over time"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT DATE(qa.submitted_at) as date, AVG(qa.score) as avg_score, COUNT(*) as attempts
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE p.user_id = %s
                  AND qa.submitted_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE (qa.submitted_at)
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
