# Comment Copilot local companion
Requires Node.js 22+ and Google Chrome installed. Run `npm install`.
Set GROQ_API_KEY for Groq or OPENAI_API_KEY for OpenAI in your terminal (never in the dashboard). Groq takes priority if both are set. Optional GROQ_MODEL defaults to openai/gpt-oss-20b; OPENAI_MODEL defaults to gpt-4.1-mini. Run `npm start`, open http://127.0.0.1:4318 and paste the terminal's pairing token in Preferences. Save, then test the connection.

Windows PowerShell (Groq): `$env:GROQ_API_KEY = "your-groq-key"`

Windows PowerShell (OpenAI): `$env:OPENAI_API_KEY = "your-openai-key"`
macOS/Linux: `export OPENAI_API_KEY="your-key"`

Find posts opens LinkedIn search in a new tab in your existing Google Chrome session, using the first configured interest. Use Add post to import the post URL and text manually. The companion does not read your Chrome tabs. Generate sends the imported text, interests, and writing voice to your configured AI provider. Groq offers limited free usage; OpenAI requires available API credits.

Use comment approves locally. Copy & open in Chrome copies the approved comment and opens the exact post in Chrome. Paste the comment into LinkedIn, review, and submit yourself. Sample posts are explicitly illustrative and cannot be opened through this action. If you have multiple Chrome profiles or windows, Chrome chooses the destination; keep your LinkedIn profile active.

State is stored in your browser. The hosted dashboard and local dashboard have separate browser storage. The companion uses your existing Chrome session; it no longer uses .browser-profile. Stop the process to disconnect. A fresh pairing token is generated on every start. The companion accepts only the local dashboard and the specific hosted site origin.

AI calls require your API key. Clipboard access must be allowed for Copy & open in Chrome.

## New Sites workspace
The new React dashboard is in copilot-site. Run `npm run dashboard` in a separate terminal and open http://127.0.0.1:5173. Run `npm start` for the companion API; its home URL redirects to the new dashboard when copilot-site is present. The old manual dashboard remains available at http://127.0.0.1:4318/legacy. It uses saved cloud workspace data and the companion automation routes /automation-login, /scan, and /prepare-automated. Open https://linkedin-comment-workspace.iamus4ma391544.chatgpt.site and follow Settings. Discovery reads a bounded batch of visible discussion and hiring posts, then scores and drafts with your configured AI provider. Sign in once in the separate companion Chrome profile. Approved comments are filled, never posted automatically. The existing local dashboard keeps its manual copy-and-open behavior.

## Application documents with Groq

In the full project, `npm start` runs the dashboard and companion together. Set `GROQ_API_KEY` in that terminal, restart, and reconnect with the new pairing token. In Applications > Profile & master CV, select Groq (hosted), choose `openai/gpt-oss-20b`, and save. Score & tailor documents uses Groq for compatibility scoring, resume customization and cover letters without local Ollama or a GPU. Generation sends your CV, profile, contact details and job description to Groq; the API key stays in the companion. Groq limits are handled with actionable errors. Ollama remains optional. Review and approve documents before preparing an application; final submission stays manual.
