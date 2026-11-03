# Version Updates for RAG Code

For any questions, please reach out on Slack/other preferred mode of communication.

## Last Updated: April 16, 2025

- Summary prompts slightly updated.
- RAG POV - prompts may slightly need to be improved, but overall success rate and quality of responses is high
- For the first semester - quite satisfied with the work, but will look to improve response times and other details in the summary/chatbot responses.

## April 3, 2025 (Neil)

- Now takes in YouTube links and generates summary dynamically.
- Chatting works with both YouTube and preloaded transcripts.
- From a RAG standpoint - mostly done, although some prompt enhancements and improving the way memory is managed, will need to be done in the future.

## April 2, 2025 (Neil)

- Frontend has mostly been integrated with RAG code.
- Chatting now works with the six library transcripts, and summary generation works as well.
- Evelyn, Zech, and Vidyut worked on frontend/UI improvements for the chatbot, most notably fixing the dark text and having the chats persist in that session when switching to/from full-screen mode and also when closing the chat window itself.
- For the RAG functionality, it seems the only thing left (very important) is to add functionality of adding a YouTube link and have summary generation/chatting work on that as well.
- The actual model and RAG pipeline might need some improvements later, but hoping it is good enough for demo purposes.

## March 20, 2025 (Neil)

- Added code to take in YouTube URL and generate transcript/summary using it
- Uses the YouTube transcription standard API (not that bad actually)
- Tried few runs on Coinbase/Alphabet transcripts and seems to work decently
- Need to reload if you want to try it on a new video, but this is just a Streamlit problem and should work fine on backend
- The user would have to start a new conversation anyway
- NEW: Added CLI file to communicate via command-line - most probably will be using similar file to just have the API routes call these functions.

## Feb 27, 2025 (Neil)

- Added main README and RAG README for installation instructions.
- Added requirements.txt (not sure if anything changes on MacOS in terms of libraries that need to be installed)
- Created this file! All updates should go in this file.
- Will try to store convo history in a JSON so it can be stored in some sort of database, where the user can look at it again.
