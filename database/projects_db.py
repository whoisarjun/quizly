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

def create_projects_table():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                CREATE TABLE IF NOT EXISTS projects
                (
                    id          SERIAL PRIMARY KEY,
                    user_id     INTEGER      NOT NULL,
                    name        VARCHAR(200) NOT NULL,
                    description TEXT,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
                """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ projects table created (or already existed).")

def create_new_project(user_id, name, description=""):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                INSERT INTO projects (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id, created_at
                """, (user_id, name, description))
    result = cur.fetchone()
    project_id, created_at = result
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Created project '{name}' with ID {project_id}")
    return {
        'id': project_id,
        'user_id': user_id,
        'name': name,
        'description': description,
        'created_at': created_at,
        'file_count': 0,
        'quiz_count': 0
    }

def get_user_projects(user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT p.id,
                       p.name,
                       p.description,
                       p.created_at,
                       p.updated_at,
                       COUNT(DISTINCT pf.id)      as file_count,
                       COUNT(DISTINCT q.id)       as quiz_count,
                       COALESCE(AVG(qa.score), 0) as avg_score
                FROM projects p
                         LEFT JOIN project_files pf ON p.id = pf.project_id
                         LEFT JOIN quizzes q ON p.id = q.project_id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id
                WHERE p.user_id = %s
                GROUP BY p.id, p.name, p.description, p.created_at, p.updated_at
                ORDER BY p.updated_at DESC
                """, (user_id,))

    projects = []
    for row in cur.fetchall():
        projects.append({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'created_at': row[3],
            'updated_at': row[4],
            'file_count': row[5],
            'quiz_count': row[6],
            'last_score': int(row[7]) if row[7] else 0
        })

    cur.close()
    conn.close()
    return projects

def get_project_by_id(project_id, user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT id, user_id, name, description, created_at, updated_at
                FROM projects
                WHERE id = %s
                  AND user_id = %s
                """, (project_id, user_id))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'id': result[0],
        'user_id': result[1],
        'name': result[2],
        'description': result[3],
        'created_at': result[4],
        'updated_at': result[5]
    }

def update_project(project_id, user_id, name=None, description=None):
    conn = get_conn()
    cur = conn.cursor()

    updates = []
    params = []

    if name:
        updates.append("name = %s")
        params.append(name)

    if description is not None:
        updates.append("description = %s")
        params.append(description)

    if not updates:
        cur.close()
        conn.close()
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([project_id, user_id])

    query = f"""
        UPDATE projects 
        SET {', '.join(updates)}
        WHERE id = %s AND user_id = %s
    """

    cur.execute(query, params)
    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    if updated:
        print(f"✅ Updated project {project_id}")

    return updated

def delete_project(project_id, user_id):
    conn = get_conn()
    cur = conn.cursor()

    # First get project name for logging
    cur.execute("SELECT name FROM projects WHERE id = %s AND user_id = %s", (project_id, user_id))
    result = cur.fetchone()

    if not result:
        cur.close()
        conn.close()
        return False

    project_name = result[0]

    # Delete project (CASCADE will handle related records)
    cur.execute("DELETE FROM projects WHERE id = %s AND user_id = %s", (project_id, user_id))
    deleted = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    if deleted:
        print(f"✅ Deleted project '{project_name}' (ID: {project_id})")

    return deleted

def get_project_stats(user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT COUNT(DISTINCT p.id)       as total_projects,
                       COUNT(DISTINCT q.id)       as total_quizzes,
                       COALESCE(AVG(qa.score), 0) as avg_score
                FROM projects p
                         LEFT JOIN quizzes q ON p.id = q.project_id
                         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id
                WHERE p.user_id = %s
                """, (user_id,))

    result = cur.fetchone()
    cur.close()
    conn.close()

    return {
        'total_projects': result[0] if result else 0,
        'total_quizzes': result[1] if result else 0,
        'avg_score': int(result[2]) if result and result[2] else 0
    }

def search_projects(user_id, query):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT p.id,
                       p.name,
                       p.description,
                       p.created_at,
                       COUNT(DISTINCT pf.id) as file_count,
                       COUNT(DISTINCT q.id)  as quiz_count
                FROM projects p
                         LEFT JOIN project_files pf ON p.id = pf.project_id
                         LEFT JOIN quizzes q ON p.id = q.project_id
                WHERE p.user_id = %s
                  AND (LOWER(p.name) LIKE LOWER(%s) OR LOWER(p.description) LIKE LOWER(%s))
                GROUP BY p.id, p.name, p.description, p.created_at
                ORDER BY p.updated_at DESC
                """, (user_id, f"%{query}%", f"%{query}%"))

    projects = []
    for row in cur.fetchall():
        projects.append({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'created_at': row[3],
            'file_count': row[4],
            'quiz_count': row[5]
        })

    cur.close()
    conn.close()
    return projects