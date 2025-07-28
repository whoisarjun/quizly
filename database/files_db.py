import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime
import uuid

load_dotenv()

def get_conn():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        dbname=os.getenv("PG_DB"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD")
    )

# init
def create_project_files_table():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                CREATE TABLE IF NOT EXISTS project_files
                (
                    id                SERIAL PRIMARY KEY,
                    project_id        INTEGER      NOT NULL,
                    filename          VARCHAR(255) NOT NULL,
                    original_filename VARCHAR(255) NOT NULL,
                    file_size         BIGINT       NOT NULL,
                    mime_type         VARCHAR(100) NOT NULL,
                    file_path         VARCHAR(500) NOT NULL,
                    upload_date       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed         BOOLEAN   DEFAULT FALSE,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                )
                """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ project_files table created (or already existed).")

# add file record to db
def add_file_to_project(project_id, original_filename, file_size, mime_type, file_path):
    file_extension = os.path.splitext(original_filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                INSERT INTO project_files (project_id, filename, original_filename, file_size, mime_type, file_path)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """, (project_id, unique_filename, original_filename, file_size, mime_type, file_path))

    result = cur.fetchone()
    file_id = result[0]

    cur.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s", (project_id,))

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Added file '{original_filename}' to project {project_id}")
    return file_id

# get all files for a specific project
def get_project_files(project_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT id,
                       filename,
                       original_filename,
                       file_size,
                       mime_type,
                       file_path,
                       upload_date,
                       processed
                FROM project_files
                WHERE project_id = %s
                ORDER BY upload_date DESC
                """, (project_id,))

    files = []
    for row in cur.fetchall():
        files.append({
            'id': row[0],
            'filename': row[1],
            'original_filename': row[2],
            'file_size': row[3],
            'mime_type': row[4],
            'file_path': row[5],
            'upload_date': row[6],
            'processed': row[7]
        })

    cur.close()
    conn.close()
    return files

# get a specific file
def get_file_by_id(file_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT pf.id,
                       pf.project_id,
                       pf.filename,
                       pf.original_filename,
                       pf.file_size,
                       pf.mime_type,
                       pf.file_path,
                       pf.upload_date,
                       pf.processed,
                       p.user_id
                FROM project_files pf
                         JOIN projects p ON pf.project_id = p.id
                WHERE pf.id = %s
                """, (file_id,))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'id': result[0],
        'project_id': result[1],
        'filename': result[2],
        'original_filename': result[3],
        'file_size': result[4],
        'mime_type': result[5],
        'file_path': result[6],
        'upload_date': result[7],
        'processed': result[8],
        'user_id': result[9]
    }

# delete a file
def delete_file(file_id, user_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
                SELECT pf.original_filename, pf.file_path, pf.project_id
                FROM project_files pf
                         JOIN projects p ON pf.project_id = p.id
                WHERE pf.id = %s
                  AND p.user_id = %s
                """, (file_id, user_id))

    result = cur.fetchone()
    if not result:
        cur.close()
        conn.close()
        return False, "File not found or permission denied"

    filename, file_path, project_id = result

    cur.execute("DELETE FROM project_files WHERE id = %s", (file_id,))

    cur.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s", (project_id,))

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Deleted file '{filename}' (ID: {file_id})")
    return True, file_path

# mark a file as processed
def mark_file_processed(file_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                UPDATE project_files
                SET processed = TRUE
                WHERE id = %s
                """, (file_id,))

    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    if updated:
        print(f"✅ Marked file {file_id} as processed")

    return updated

# get all unprocessed files
def get_unprocessed_files():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT pf.id,
                       pf.project_id,
                       pf.filename,
                       pf.original_filename,
                       pf.file_path,
                       pf.mime_type,
                       p.user_id
                FROM project_files pf
                         JOIN projects p ON pf.project_id = p.id
                WHERE pf.processed = FALSE
                ORDER BY pf.upload_date ASC
                """, )

    files = []
    for row in cur.fetchall():
        files.append({
            'id': row[0],
            'project_id': row[1],
            'filename': row[2],
            'original_filename': row[3],
            'file_path': row[4],
            'mime_type': row[5],
            'user_id': row[6]
        })

    cur.close()
    conn.close()
    return files

# get file stats for a project
def get_file_stats_by_project(project_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT COUNT(*)                                                  as total_files,
                       COALESCE(SUM(file_size), 0)                               as total_size,
                       COUNT(CASE WHEN processed = TRUE THEN 1 END)              as processed_files,
                       COUNT(CASE WHEN mime_type LIKE 'image/%' THEN 1 END)      as image_files,
                       COUNT(CASE WHEN mime_type = 'application/pdf' THEN 1 END) as pdf_files,
                       COUNT(CASE WHEN mime_type LIKE 'text/%' THEN 1 END)       as text_files
                FROM project_files
                WHERE project_id = %s
                """, (project_id,))

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return None

    return {
        'total_files': result[0],
        'total_size': result[1],
        'processed_files': result[2],
        'image_files': result[3],
        'pdf_files': result[4],
        'text_files': result[5]
    }

# search files within a project by filename
def search_files_in_project(project_id, query):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
                SELECT id, filename, original_filename, file_size, mime_type, upload_date
                FROM project_files
                WHERE project_id = %s
                  AND LOWER(original_filename) LIKE LOWER(%s)
                ORDER BY upload_date DESC
                """, (project_id, f"%{query}%"))

    files = []
    for row in cur.fetchall():
        files.append({
            'id': row[0],
            'filename': row[1],
            'original_filename': row[2],
            'file_size': row[3],
            'mime_type': row[4],
            'upload_date': row[5]
        })

    cur.close()
    conn.close()
    return files
