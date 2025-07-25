from users_db import create_users_table
from projects_db import create_projects_table
from files_db import create_project_files_table
from quizzes_db import create_quiz_tables


def init_all_tables():
    """Initialize all database tables"""
    print("🚀 Starting database initialization...")

    try:
        # Create tables in correct order (respecting foreign key dependencies)
        print("\n📋 Creating users table...")
        create_users_table()

        print("\n📁 Creating projects table...")
        create_projects_table()

        print("\n📄 Creating files table...")
        create_project_files_table()

        print("\n❓ Creating quiz tables...")
        create_quiz_tables()

        print("\n🎉 Database initialization completed successfully!")
        print("Quizper dbs ready to go!")

    except Exception as e:
        print(f"\n❌ Error during database initialization: {e}")


if __name__ == "__main__":
    init_all_tables()