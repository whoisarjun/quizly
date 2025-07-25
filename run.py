from flask import Flask, render_template, request, jsonify
from file_manager import text_extractor
from llm import chatbot
import os

app = Flask(__name__, static_folder='static')

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

if __name__ == '__main__':
    app.run(debug=True, port=6888)