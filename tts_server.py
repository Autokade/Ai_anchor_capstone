"""
Edge TTS Flask server for HanaVerse.
Exposes POST /tts which accepts JSON: {"text": "...", "voice": "en-US-AriaNeural"}
and returns generated speech as audio/mpeg.

Run alongside server.py (the Ollama backend) on a different port:
    python tts_server.py
Listens on http://localhost:5001/tts by default, matching BACKEND_URL_TTS in script.js.
"""

import asyncio
import io

import edge_tts
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow requests from index.html opened via file:// or a different port

DEFAULT_VOICE = "en-US-AriaNeural"  # change to any edge-tts voice you like


async def synthesize(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio_chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
    return b"".join(audio_chunks)


@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    voice = data.get("voice", DEFAULT_VOICE)

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        audio_bytes = asyncio.run(synthesize(text, voice))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if not audio_bytes:
        return jsonify({"error": "TTS produced no audio"}), 500

    return send_file(
        io.BytesIO(audio_bytes),
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="speech.mp3",
    )


@app.route("/tts", methods=["GET"])
def health():
    return jsonify({"status": "Edge TTS server is running"})


if __name__ == "__main__":
    print("Starting Edge TTS server on http://localhost:5001 ...")
    app.run(host="0.0.0.0", port=5001, debug=False)
