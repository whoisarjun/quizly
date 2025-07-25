from flask import Flask, render_template, request, jsonify
from argon2 import PasswordHasher
from file_manager import text_extractor
from llm import chatbot
from database import users_db
import os

app = Flask(__name__, static_folder='static')
users_db.create_users_table()
ph = PasswordHasher()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/login')
def login():
    return render_template('sign_in.html')

@app.route('/generate', methods=['POST'])
def generate():
    print('made post request')
    files = request.files.getlist('files')

    saved_files = []
    upload_folder = os.path.join(app.root_path, 'temp')
    os.makedirs(upload_folder, exist_ok=True)

    print('received files')
    for file in files:
        filename = file.filename
        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)
        saved_files.append(filename)

    filepaths = [os.path.join(upload_folder, filename) for filename in saved_files]
    file_content = text_extractor.generate_plaintext(filepaths)
    response = chatbot.generate_quiz_prompt(file_content)

    with open('temp/test.txt', 'w') as f:
        f.write(response)

    return jsonify({
        "status": "success",
        "message": f"Received {len(saved_files)} files.",
        "quiz": response
    })

@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()

    first_name = data.get('first_name')
    last_name = data.get('last_name')
    email = data.get('email')
    password = ph.hash(data.get('password'))

    if users_db.user_exists(email):
        return jsonify({"status": "error", "message": "Email is being used"}), 200
    else:
        try:
            users_db.create_new_user(first_name, last_name, email, password)
            return jsonify({"status": "success", "message": "User created successfully"}), 201
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/sign_in', methods=['POST'])
def sign_in():
    data = request.get_json()
    print(data)

    email = data.get('email')
    password = data.get('password')

    if users_db.user_exists(email):
        validation = users_db.validate_user(email, password)
        if validation[0]:
            print(f'Successfully signed in {email}')
            return jsonify(validation[1]), 200
        else:
            return jsonify(validation[1]), 200
    else:
        return jsonify({"status": "error", "message": "User not found"}), 200

@app.route('/dashboard', methods=['GET'])
def dashboard():
    return render_template('dashboard.html')

if __name__ == '__main__':
    app.run(debug=True, port=6888)