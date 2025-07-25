from users_db import create_users_table
from projects_db import create_projects_table
from files_db import create_project_files_table
from quizzes_db import create_quiz_tables


def init_all_tables():
    print("Starting database initialization...")

    try:
        print("\nCreating users table...")
        create_users_table()

        print("\nCreating projects table...")
        create_projects_table()

        print("\nCreating files table...")
        create_project_files_table()

        print("\nCreating quiz tables...")
        create_quiz_tables()

        print("\nDatabase initialization completed successfully!")
        print("Quizper dbs are ready!")

    except Exception as e:
        print(f"\nError during database initialization: {e}")


if __name__ == "__main__":
    init_all_tables()