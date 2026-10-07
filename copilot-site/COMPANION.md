# LinkedIn Comment Copilot companion
Requires Node.js 22+ and Google Chrome.

1. Run npm install in this folder.
2. Set your AI key in the same terminal (never in the website):
   PowerShell: $env:GROQ_API_KEY = "your-groq-key"
   Optional: $env:GROQ_MODEL = "openai/gpt-oss-20b"
   Or set OPENAI_API_KEY to use OpenAI instead. Groq takes priority.
3. Run npm start.
4. Open https://linkedin-comment-workspace.iamus4ma391544.chatgpt.site
5. In Settings, paste the printed pairing token, Connect, then Sign in to LinkedIn.
6. Chrome opens a separate companion profile. Sign in there once.
7. Return to the dashboard and choose Find & draft. A small batch of visible discussion and hiring posts is read and analyzed.
8. Review and edit comments. Choose Use comment, then Approved > Prepare in LinkedIn.
9. The companion fills the comment box. You review and click Post yourself.

Allow access to the local network if your browser asks. The pairing token changes each restart. Keep it private. Do not share .browser-profile or any keys. LinkedIn changes its page layout occasionally; manual Add post is available when discovery is unavailable. This is manual, bounded discovery, not continuous scraping. AI quota and rate limits still apply. No automatic posting.


## Automation update 2.1.0

Restart the companion after updating files, then pair using the newly printed token. The dashboard checks both the running version and whether files changed since startup.

Settings now include verified profile facts, a 1?12 post scan budget, and a posting-date filter. Discovery searches up to three interests, alternating discussion and job queries; configured locations rotate across job searches. LinkedIn layout changes can still require a reader update.

Scans run in the companion and checkpoint each discovered post and completed draft under `.automation/scan.json`. Keep this private. The dashboard imports completed drafts while polling progress. After a crash or error, use **Resume scan / retry step**; keep the same companion folder. A new scan replaces the previous checkpoint. Draft cache entries expire after seven days and are limited to 200. Regenerate bypasses the cache. Temporary rate limits retry twice; billing/quota failures do not retry.

**Prepare approved queue** fills comments sequentially. **Pause after current comment** stops before the next item. You submit each comment yourself in LinkedIn. Existing different drafts are protected; retries reuse an already-open post and accept an identical draft. Preparation failures save editor metadata to `.diagnostics/linkedin-prepare.json`.

Run `npm test` for checkpoint, cache and retry tests, and `npm run check` for syntax checks.


## One-terminal startup

In the full project, `npm start` launches both the companion and dashboard at http://127.0.0.1:5173. API keys set in that terminal are inherited. Ctrl+C stops both services. Stop any previously started companion or dashboard before switching to this command. The standalone companion download runs only the companion because it does not include the React project.


## Applications workspace (2.4.0)

Run `npm start` with `GROQ_API_KEY` configured to use hosted Groq document generation; no local model or GPU is required. In Applications, choose Groq under Profile & master CV and save. Groq uses openai/gpt-oss-20b by default, with openai/gpt-oss-120b also available. The key stays in the companion; generation sends the CV, profile, contact details and job description to Groq. Existing Ollama selections are preserved. Ollama remains optional: install it from https://ollama.com/download and select a local model. `OLLAMA_HOST` defaults to `http://127.0.0.1:11434`; optional `OLLAMA_MODEL` supplies the initial model selection. Remote Ollama hosts are disabled for this workflow.

1. In **Applications ? Profile & master CV**, enter verified skills, experience, preferences and contact details. Upload a PDF/DOCX up to 5 MB, review the extracted text, and save. Scanned PDFs without readable text require OCR or pasted text. Original file bytes are processed in memory by the companion; the extracted text and document drafts are persisted in the authenticated workspace.
2. Choose **Groq (hosted)** and click **Check Groq** to check key configuration, then choose a Groq model. API access is verified during generation. Alternatively select **Ollama (local)**, click **Check Ollama**, and choose an installed model. No model is silently downloaded. Local inference depends on your computer's memory and model capability; requests time out after ten minutes to accommodate CPU inference.
3. Import a public HTTPS job link. The companion opens it in Chrome, reads JobPosting structured data or the visible description, and keeps the page available for review. Check and correct imported information. If login/captcha/dynamic layout blocks extraction, sign in in that tab or paste the job description manually.
4. **Score & tailor documents** returns compatibility, matches, gaps, a complete text resume, a cover letter and source evidence. It uses only your supplied CV/profile facts; review remains necessary. Each job retains separate drafts. Editing approved documents or profile/contact information revokes approval of pending applications.

Groq generation uses three sequential requests: a compact JSON assessment, a plain-text resume, and a plain-text cover letter. This avoids putting long multiline documents inside a generated JSON string. Score bounds and evidence quotes are checked locally before document generation, and the final result is saved only when all steps complete. These requests count toward your Groq usage limits.
5. Review both documents, check the confirmation, and **Approve documents**. Download the tailored resume as **DOCX** or **PDF**, the cover letter as DOCX, or choose **Prepare application**. Resume exports use a single column, Arial text, standard section headings and simple bullets without tables, graphics, headers or footers. PDF text is selectable and searchable; local Google Chrome generates it. Follow the employer's requested format. Existing approved drafts can be downloaded without regenerating them. This formatting reduces parsing obstacles but does not guarantee a particular ATS score.
6. Automatic preparation supports standard public Lever (`jobs.lever.co`) and Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards.eu.greenhouse.io`) forms: labelled/named contact fields, a DOCX resume file input and cover-letter text/upload when available. Existing values/files are preserved. Custom fields, screening, demographic answers, login challenges and final submission remain manual. Custom company domains, embedded third-party forms and other sites open for manual completion. PDF-only upload fields are reported for manual handling.
7. After submitting on the employer site, explicitly confirm and **Mark as applied** in the dashboard. Opening or filling a form never marks it applied.

The new application records use a separate namespaced row in the existing D1 workspaces table. Comment data remains separate. This update is local; no new deployment is required for `npm start`.

### Find and save LinkedIn jobs

In **Applications**, use **Find LinkedIn jobs**. **Use profile suggestions** fills keywords from your stated role and location from your profile/CV. Suggestions are local rules, not an AI compatibility score. Edit keywords and location, select work mode and posting date, then click **Search LinkedIn**. Blank keywords use profile suggestions. The companion opens LinkedIn Jobs in its signed-in Chrome session and reads a bounded batch of 3, 5 or 10 listings. It checks up to 20 loaded cards and skips job IDs already saved, including tracked/slugged versions of the same link. No CV or contact text is included in the LinkedIn search URL.

Review each listing and choose **Save job** or **Save all new jobs**. Saved jobs appear in your Applications list and remain after reload; then use **Score & tailor documents**. If a description cannot be read, the listing can still be saved and its description pasted manually. If no readable listings are found, check the search tab for sign-in or no results and retry with broader keywords. LinkedIn layout changes can require reader updates. Searches do not apply to jobs or submit forms.


### Local Ollama setup on this laptop

The model selector also offers `qwen3:1.7b-gpu` (GPU). Recreate it with `ollama pull qwen3:1.7b` followed by `ollama create qwen3:1.7b-gpu -f Ollama.GPU.Modelfile`, then click **Check Ollama**. It requests GPU offload and an 8192-token context. The smaller model fits the Quadro M4000M's memory (about 2.2 GB allocated in the test), but GPU warm-up still failed with `0xc0000005` on this laptop. Keep the CPU model selected until the local GPU runtime issue is resolved. GPU selection requests acceleration; it does not guarantee successful loading on every driver/device.

Ollama 0.35.1 and qwen3:4b are installed. GPU warm-up crashed on the Quadro M4000M, so use **qwen3:4b-cpu** in Applications. This variant shares the downloaded weights, disables GPU offload and uses an 8192-token context. Recreate it with `ollama create qwen3:4b-cpu -f Ollama.Modelfile`. The application disables thinking for Qwen3 models to reduce generation time. `OLLAMA_MODEL=qwen3:4b-cpu` is saved in the Windows user environment; new terminals inherit it.
