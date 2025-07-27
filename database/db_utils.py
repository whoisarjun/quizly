import psycopg2
import os
from dotenv import load_dotenv
from .users_db import get_conn

load_dotenv()

def get_user_id_by_email(email):
    """Get user ID by email (useful for session management)"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    result = cur.fetchone()
    cur.close()
    conn.close()

    return result[0] if result else None

def get_user_info(user_id):
    """Get basic user information"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT id, first_name, last_name, email
                FROM users
                WHERE id = %s
                """, (user_id,))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'id': result[0],
        'first_name': result[1],
        'last_name': result[2],
        'email': result[3]
    }

def verify_project_ownership(project_id, user_id):
    """Verify that a user owns a specific project"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT 1
                FROM projects
                WHERE id = %s
                  AND user_id = %s
                """, (project_id, user_id))

    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists

def get_database_stats():
    """Get overall database statistics (useful for admin dashboard)"""
    conn = get_conn()
    cur = conn.cursor()

    stats = {}

    # User count
    cur.execute("SELECT COUNT(*) FROM users")
    stats['total_users'] = cur.fetchone()[0]

    # Project count
    cur.execute("SELECT COUNT(*) FROM projects")
    stats['total_projects'] = cur.fetchone()[0]

    # File count and total size
    cur.execute("SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM project_files")
    result = cur.fetchone()
    stats['total_files'] = result[0]
    stats['total_file_size'] = result[1]

    # Quiz count
    cur.execute("SELECT COUNT(*) FROM quizzes")
    stats['total_quizzes'] = cur.fetchone()[0]

    # Quiz attempts count
    cur.execute("SELECT COUNT(*) FROM quiz_attempts")
    stats['total_attempts'] = cur.fetchone()[0]

    # Recent activity (last 7 days)
    cur.execute("""
                SELECT COUNT(*)
                FROM projects
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                """)
    stats['recent_projects'] = cur.fetchone()[0]

    cur.execute("""
                SELECT COUNT(*)
                FROM quiz_attempts
                WHERE submitted_at >= CURRENT_DATE - INTERVAL '7 days'
                """)
    stats['recent_attempts'] = cur.fetchone()[0]

    cur.close()
    conn.close()
    return stats

def cleanup_orphaned_files():
    """Clean up files that don't belong to any project (maintenance function)"""
    conn = get_conn()
    cur = conn.cursor()

    # Find orphaned files (shouldn't happen with proper foreign keys, but just in case)
    cur.execute("""
                SELECT pf.id, pf.file_path
                FROM project_files pf
                         LEFT JOIN projects p ON pf.project_id = p.id
                WHERE p.id IS NULL
                """)

    orphaned_files = cur.fetchall()

    if orphaned_files:
        # Delete orphaned records
        orphaned_ids = [f[0] for f in orphaned_files]
        cur.execute("""
                    DELETE
                    FROM project_files
                    WHERE id = ANY(%s)
                    """, (orphaned_ids,))

        conn.commit()
        print(f"✅ Cleaned up {len(orphaned_files)} orphaned file records")

        # Return file paths for actual file deletion
        return [f[1] for f in orphaned_files]

    cur.close()
    conn.close()
    return []

def get_user_storage_usage(user_id):
    """Get storage usage for a specific user"""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT COUNT(pf.id)                   as file_count,
                       COALESCE(SUM(pf.file_size), 0) as total_size,
                       COUNT(DISTINCT p.id)           as project_count
                FROM projects p
                         LEFT JOIN project_files pf ON p.id = pf.project_id
                WHERE p.user_id = %s
                """, (user_id,))

    result = cur.fetchone()
    cur.close()
    conn.close()

    return {
        'file_count': result[0],
        'total_size': result[1],
        'project_count': result[2]
    }

def format_file_size(size_bytes):
    """Convert bytes to human readable format"""
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_names[i]}"

def backup_user_data(user_id, backup_path):
    """Create a backup of all user data (projects, files metadata, quizzes)"""
    import json
    from datetime import datetime

    conn = get_conn()
    cur = conn.cursor()

    backup_data = {
        'backup_created': datetime.now().isoformat(),
        'user_id': user_id,
        'projects': [],
        'files': [],
        'quizzes': [],
        'quiz_attempts': []
    }

    # Get projects
    cur.execute("""
                SELECT id, name, description, created_at, updated_at
                FROM projects
                WHERE user_id = %s
                """, (user_id,))

    for row in cur.fetchall():
        backup_data['projects'].append({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'created_at': row[3].isoformat() if row[3] else None,
            'updated_at': row[4].isoformat() if row[4] else None
        })

    # Get files
    cur.execute("""
                SELECT pf.id,
                       pf.project_id,
                       pf.filename,
                       pf.original_filename,
                       pf.file_size,
                       pf.mime_type,
                       pf.upload_date
                FROM project_files pf
                         JOIN projects p ON pf.project_id = p.id
                WHERE p.user_id = %s
                """, (user_id,))

    for row in cur.fetchall():
        backup_data['files'].append({
            'id': row[0],
            'project_id': row[1],
            'filename': row[2],
            'original_filename': row[3],
            'file_size': row[4],
            'mime_type': row[5],
            'upload_date': row[6].isoformat() if row[6] else None
        })

    # Get quizzes with questions
    cur.execute("""
                SELECT q.id, q.project_id, q.title, q.difficulty, q.question_count, q.created_at
                FROM quizzes q
                         JOIN projects p ON q.project_id = p.id
                WHERE p.user_id = %s
                """, (user_id,))

    for quiz_row in cur.fetchall():
        quiz_data = {
            'id': quiz_row[0],
            'project_id': quiz_row[1],
            'title': quiz_row[2],
            'difficulty': quiz_row[3],
            'question_count': quiz_row[4],
            'created_at': quiz_row[5].isoformat() if quiz_row[5] else None,
            'questions': []
        }

        # Get questions for this quiz
        cur.execute("""
                    SELECT question_text, question_type, options, correct_answer, explanation, question_order
                    FROM quiz_questions
                    WHERE quiz_id = %s
                    ORDER BY question_order
                    """, (quiz_row[0],))

        for q_row in cur.fetchall():
            quiz_data['questions'].append({
                'text': q_row[0],
                'type': q_row[1],
                'options': json.loads(q_row[2]),
                'correct_answer': q_row[3],
                'explanation': q_row[4],
                'order': q_row[5]
            })

        backup_data['quizzes'].append(quiz_data)

    # Get quiz attempts
    cur.execute("""
                SELECT qa.quiz_id, qa.score, qa.answers, qa.submitted_at
                FROM quiz_attempts qa
                         JOIN quizzes q ON qa.quiz_id = q.id
                         JOIN projects p ON q.project_id = p.id
                WHERE qa.user_id = %s
                  AND p.user_id = %s
                """, (user_id, user_id))

    for row in cur.fetchall():
        backup_data['quiz_attempts'].append({
            'quiz_id': row[0],
            'score': float(row[1]),
            'answers': json.loads(row[2]),
            'submitted_at': row[3].isoformat() if row[3] else None
        })

    cur.close()
    conn.close()

    # Save backup to file
    with open(backup_path, 'w') as f:
        json.dump(backup_data, f, indent=2)

    print(f"✅ User data backup created: {backup_path}")
    return backup_data
