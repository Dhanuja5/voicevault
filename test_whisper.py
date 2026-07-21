import whisper

# Load the model
model = whisper.load_model("small")  # or "base" if you want faster but less accurate

# Transcribe your audio
result = model.transcribe("notes.mp3")

# Print the transcription
print(result["text"])
