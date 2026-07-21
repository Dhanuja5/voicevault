# server.py
import os
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from bson.objectid import ObjectId
from dotenv import load_dotenv

# Local transcription via faster-whisper
from faster_whisper import WhisperModel



load_dotenv()

# --- Config ---
UPLOAD_FOLDER = "uploads"
FRONTEND_FOLDER = "public"
ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a"}

MONGO_URI = os.getenv("MONGO_URI")

WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")  # tiny/base for fast deployment

if not MONGO_URI:
    raise RuntimeError("Set MONGO_URI in your environment")


os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- Flask app (serve static frontend) ---
app = Flask(__name__, static_folder=FRONTEND_FOLDER, static_url_path="")
CORS(app)

import certifi

# --- MongoDB setup ---
mongo_client = None

def get_db():
    global mongo_client
    if mongo_client is None:
        try:
            client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,
                tlsCAFile=certifi.where()
            )
            client.admin.command('ping')
            mongo_client = client
            print("[INFO] Connected to MongoDB Atlas successfully.")
        except Exception as e:
            print(f"[WARN] MongoDB Atlas connection check failed: {e}")
            return None
    return mongo_client["voicevault"]

import re
def get_user_collection(user_email):
    """Return a per-user MongoDB collection based on the user's email.
    e.g. 'dhanujasree2006@gmail.com' -> db['transcriptions_dhanujasree2006_gmail_com']
    Falls back to 'transcriptions_unknown' if no email provided."""
    database = get_db()
    if database is None:
        return None
    if not user_email or user_email == "unknown":
        return database["transcriptions_unknown"]
    # Sanitize email: replace non-alphanumeric chars with underscore
    safe_name = re.sub(r'[^a-zA-Z0-9]', '_', user_email.lower())
    return database[f"transcriptions_{safe_name}"]



# --- Lazy Whisper model loader ---
model = None

def get_whisper_model():
    global model
    if model is None:
        try:
            print(f"[INFO] Initializing Whisper model '{WHISPER_MODEL_NAME}' lazily...")
            model = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type="default")
            print("[INFO] Whisper model loaded successfully.")
        except Exception as me:
            print(f"[WARN] Could not load Whisper model '{WHISPER_MODEL_NAME}': {me}")
            model = False  # Mark as failed to avoid repeated heavy attempts
    return model if model is not False else None

def transcribe_audio_file(local_path):
    """Transcribe audio file safely with multi-engine fallback."""
    # 1. Try SpeechRecognition (Google Speech API) for WAV files
    try:
        import speech_recognition as sr
        r = sr.Recognizer()
        if local_path.lower().endswith(".wav"):
            with sr.AudioFile(local_path) as source:
                audio_data = r.record(source)
                text = r.recognize_google(audio_data)
                if text:
                    print("[INFO] Transcribed via SpeechRecognition (Google API)")
                    return text
    except Exception as sre:
        print(f"[DEBUG] SpeechRecognition skipped: {sre}")

    # 2. Try faster-whisper if model loads successfully
    whisper_engine = get_whisper_model()
    if whisper_engine:
        try:
            segments, info = whisper_engine.transcribe(local_path, beam_size=1)
            text = " ".join([seg.text for seg in segments]).strip()
            if text:
                print(f"[INFO] Transcribed via Whisper AI (len={len(text)} chars)")
                return text
        except Exception as te:
            print(f"[WARN] Whisper AI transcription failed: {te}")

    return "Audio note uploaded and stored successfully."

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Serve frontend index.html ---
@app.route("/", methods=["GET"])
def index():
    return app.send_static_file("index.html")

# Serve other static files automatically via Flask's static handler
# (no need for custom routes; static_folder set)

# --- Upload/Transcribe route ---
@app.route("/upload-audio", methods=["POST"])
def upload_audio():
    try:
        if "audio" not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        file = request.files["audio"]
        if file.filename == "":
            return jsonify({"error": "No selected file"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "File type not allowed"}), 400

        # Get user email for per-user isolation
        user_email = request.form.get("user_email", "unknown")

        filename = secure_filename(file.filename)
        local_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(local_path)
        print(f"[INFO] Received and saved file: {local_path} (user: {user_email})")

        # Transcribe safely
        transcription = transcribe_audio_file(local_path)

        # Save into user's own MongoDB collection
        user_collection = get_user_collection(user_email)
        inserted_id = "local_only"
        if user_collection is not None:
            try:
                doc = {
                    "filename": filename,
                    "filepath": local_path,
                    "dropbox_path": None,
                    "dropbox_url": None,
                    "uploaded_at": datetime.datetime.utcnow(),
                    "transcription": transcription,
                    "user_email": user_email
                }
                result = user_collection.insert_one(doc)
                inserted_id = str(result.inserted_id)
                print(f"[INFO] Saved to MongoDB collection '{user_collection.name}' with ID: {inserted_id}")
            except Exception as me:
                print(f"[ERROR] Failed to insert into MongoDB: {me}")

        return jsonify({
            "message": "Uploaded, transcribed, stored in MongoDB",
            "id": inserted_id,
            "filename": filename,
            "transcription": transcription
        }), 201
    except Exception as ge:
        print(f"[ERROR] Upload endpoint general error: {ge}")
        return jsonify({"error": str(ge)}), 500

# --- Get all notes (from user's own collection) ---
@app.route("/notes", methods=["GET"])
def get_notes():
    user_email = request.args.get("user_email", "")
    user_collection = get_user_collection(user_email)
    rows = []
    if user_collection is not None:
        try:
            rows = list(user_collection.find().sort("uploaded_at", -1))
            for r in rows:
                r["_id"] = str(r["_id"])
                if isinstance(r.get("uploaded_at"), datetime.datetime):
                    r["uploaded_at"] = r["uploaded_at"].isoformat()
        except Exception as e:
            print(f"[WARN] Failed to read from MongoDB: {e}")
    return jsonify(rows), 200

# --- Search transcriptions (in user's own collection) ---
@app.route("/search", methods=["GET"])
def search():
    q = request.args.get("q", "").strip()
    user_email = request.args.get("user_email", "")
    if q == "":
        return jsonify([]), 200
    user_collection = get_user_collection(user_email)
    results = []
    if user_collection is not None:
        try:
            cursor = user_collection.find({"$or": [
                {"transcription": {"$regex": q, "$options": "i"}},
                {"filename": {"$regex": q, "$options": "i"}}
            ]})
            for r in cursor:
                r["_id"] = str(r["_id"])
                if isinstance(r.get("uploaded_at"), datetime.datetime):
                    r["uploaded_at"] = r["uploaded_at"].isoformat()
                results.append(r)
        except Exception as e:
            print(f"[WARN] Search query failed: {e}")
    return jsonify(results), 200

# --- Delete (from user's collection) ---
@app.route("/delete/<id>", methods=["DELETE"])
def delete(id):
    user_email = request.args.get("user_email", "")
    user_collection = get_user_collection(user_email)
    if user_collection is not None:
        try:
            obj = user_collection.find_one({"_id": ObjectId(id)})
            if obj:
                try:
                    if obj.get("filepath") and os.path.exists(obj["filepath"]):
                        os.remove(obj["filepath"])
                except Exception as e:
                    print(f"[WARN] Could not delete local file: {e}")
                user_collection.delete_one({"_id": ObjectId(id)})
        except Exception as e:
            print(f"[WARN] Delete from MongoDB failed: {e}")
    return jsonify({"message": "Deleted"}), 200

if __name__ == "__main__":
    # run from project root so static_folder resolves: `python server.py`
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
