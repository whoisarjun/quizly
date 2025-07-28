import psycopg2
import os
from dotenv import load_dotenv
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

load_dotenv()
ph = PasswordHasher()

def get_conn():
    return psycopg2.connect(
        host=os.getenv("PG_HOST"),
        port=os.getenv("PG_PORT"),
        dbname=os.getenv("PG_DB"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD")
    )

# init
def create_users_table():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            first_name VARCHAR(64) NOT NULL,
            last_name VARCHAR(64) NOT NULL,
            email VARCHAR(120) UNIQUE NOT NULL,
            password VARCHAR(128) NOT NULL
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ users table created (or already existed).")

# sign up
def create_new_user(first_name, last_name, email, password):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO users (first_name, last_name, email, password)
        VALUES (%s, %s, %s, %s)
    """, (first_name, last_name, email, password))
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Created user {email}")

# check if user exists
def user_exists(email):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists

# check if password is right
def validate_user(email, plain_password):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT password FROM users WHERE email = %s", (email,))
    result = cur.fetchone()

    if not result:
        cur.close()
        conn.close()
        return False, {"status": "error", "message": "User not found"}

    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    user_id = cur.fetchone()
    cur.close()
    conn.close()

    stored_hash = result[0]
    try:
        ph.verify(stored_hash, plain_password)
        return True, {"status": "success", "message": "Login successful", "user_id": user_id}
    except VerifyMismatchError:
        return False, {"status": "error", "message": "Invalid password"}

