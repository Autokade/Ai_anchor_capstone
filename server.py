import pyttsx3
import tempfile
import os
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return "TTS Flask Server is running. Use POST /tts."

@app.route('/tts', methods=['POST'])
def tts():
    try:
        data = request.json
        text = data.get('text', '')
        if not text or not text.strip():
            return jsonify({'error': 'No text provided'}), 400

        engine = pyttsx3.init()
        voices = engine.getProperty('voices')
        for voice in voices:
            if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                engine.setProperty('voice', voice.id)
                break
        engine.setProperty('rate', 175)

        tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        tmp.close()
        engine.save_to_file(text, tmp.name)
        engine.runAndWait()

        return send_file(tmp.name, mimetype='audio/wav', as_attachment=False)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting TTS Flask server...")
    app.run(debug=False, host='0.0.0.0', port=5001)