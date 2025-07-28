# Quizper - AI-Powered Quiz Generator 🧠✨

An intelligent learning platform that transforms your study materials into interactive quizzes using AI. Upload documents, generate personalized quizzes, and track your learning progress with detailed analytics.

> **Personal Note**: I built this app to help me study for my A-levels - and it actually worked! Now I'm sharing it with the world so other students can benefit from AI-powered learning too. 🎓

## Features

- 📚 **Document Processing**: Upload PDFs, Word docs, and text files
- 🤖 **AI Quiz Generation**: Automatically create quizzes from your study materials using OpenAI
- 🎯 **Multiple Question Types**: Multiple choice, true/false, short answer, and fill-in-the-blank
- 📊 **Smart Analytics**: Track performance, improvement trends, and learning consistency
- 🔍 **Intelligent Grading**: AI-powered answer validation with detailed feedback and partial credit
- 📁 **Project Organization**: Organize your materials and quizzes into projects
- 🔄 **Re-validation**: Improve quiz scores with enhanced AI feedback

## Tech Stack

- **Backend**: Flask (Python)
- **Database**: PostgreSQL
- **AI/ML**: OpenAI API (GPT-4.1)
- **Frontend**: HTML, CSS, JavaScript
- **Authentication**: Session-based with Argon2 password hashing

## Setup Instructions

### Prerequisites
- Python 3.8+
- PostgreSQL
- OpenAI API key

### 1. Clone the Repository
```bash
git clone https://github.com/whoisarjun/quizper.git
cd quizper
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Database Setup
Create a PostgreSQL database and user:

```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database and user
CREATE DATABASE quizper_db;
CREATE USER quizper_master WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE quizper_db TO quizper_master;

-- Exit PostgreSQL
\q
```

Test your connection:
```bash
psql -U quizper_master -d quizper_db -W
```

### 4. Environment Configuration
Create a `.env` file in the root directory:

```env
# PostgreSQL Secrets
PG_HOST=localhost
PG_PORT=5432
PG_DB=quizper_db
PG_USER=quizper_master
PG_PASSWORD=your_secure_password

# OpenAI Keys
OPENAI_API_KEY=your_openai_api_key_here

# Server Secrets
API_SECRET_KEY=your_random_secret_key_here
```

**Important Notes:**
- Replace `your_secure_password` with a strong password you set for the PostgreSQL user
- Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Generate a random secret key for `API_SECRET_KEY` (you can use `python -c "import secrets; print(secrets.token_hex(32))"`)

### 5. Run the Application
```bash
python run.py
```

The application will be available at `http://localhost:6767`

### 6. First Use
1. Navigate to `http://localhost:6767`
2. Create an account
3. Create your first project
4. Upload study materials
5. Generate and take your first AI quiz!

## Project Structure
```
quizper/
├── run.py                 # Main Flask application
├── database/              # Database modules
│   ├── db_init.py        # Database initialization
│   ├── db_utils.py       # Database utilities
│   ├── files_db.py       # File management
│   ├── projects_db.py    # Project operations
│   ├── quizzes_db.py     # Quiz operations
│   └── users_db.py       # User management
├── file_manager/          # File processing
│   └── text_extractor.py # Document text extraction
├── llm/                   # AI/LLM integration
│   └── chatbot.py        # Quiz generation & validation
├── static/               # CSS, JS, images
├── templates/            # HTML templates
├── uploads/              # User uploaded files
└── temp/                 # Temporary files
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out

### Projects
- `GET /api/projects` - Get user projects
- `POST /api/projects` - Create new project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Files & Quizzes
- `POST /api/projects/{id}/files/upload` - Upload files
- `POST /api/projects/{id}/quizzes/generate` - Generate quiz
- `POST /api/quizzes/{id}/submit` - Submit quiz answers
- `GET /api/quizzes/{id}/analytics` - Get quiz analytics

## License & Attribution

This project is open source and free to use. If you use this code in your own project (commercial or non-commercial), please provide attribution by including:

**Required Attribution:**
- Credit to the original author
- Link to this repository: `https://github.com/whoisarjun/quizper`

**Example Attribution:**
```
Based on Quizper by Arjun Palakkal
Original repository: https://github.com/whoisarjun/quizper
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Troubleshooting

### Common Issues

**Database Connection Error:**
- Verify PostgreSQL is running
- Check your `.env` database credentials
- Ensure the database and user exist

**OpenAI API Error:**
- Verify your API key is correct
- Check you have sufficient OpenAI credits
- Ensure your API key has the required permissions

**File Upload Issues:**
- Check file size (max 25MB)
- Ensure `uploads/` directory has write permissions

### Getting Help

If you encounter issues:
1. Check the console logs for error messages
2. Verify your `.env` configuration
3. Ensure all dependencies are installed
4. Open an issue on GitHub with details

## Roadmap

- [ ] Support for more file formats
- [ ] Collaborative quiz sharing
- [ ] Advanced analytics dashboard
- [ ] Mobile app
- [ ] Integration with learning management systems

---

**⭐ If this project helped you, please give it a star on GitHub!**

Made with ❤️ for learners everywhere