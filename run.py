from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__, static_folder='static')

@app.route('/')
def home():
    return render_template('index.html')

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

    return jsonify({
        "status": "success",
        "message": f"Received {len(saved_files)} files.",
        "files": saved_files
    })

if __name__ == '__main__':
    app.run(debug=True, port=6888)