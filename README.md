# LinkedIn Copilot

A local companion and React dashboard for discovering LinkedIn conversations, drafting comments, finding jobs, and preparing tailored application documents. Review and approve the generated content before Playwright fills supported forms. You submit comments and applications yourself.

## Features

- **Comment workflow:** discover relevant discussion and hiring posts, review AI drafts, approve comments, and prepare them in LinkedIn comment boxes.
- **Job search:** suggest search keywords from your profile, filter LinkedIn jobs by location, work mode, and date, then save individual results or a batch.
- **Application documents:** import job links and a PDF/DOCX master CV, score compatibility, review skill gaps and evidence, and generate a tailored resume and cover letter.
- **Document exports:** download approved resumes as DOCX or searchable PDF, and cover letters as DOCX. Resume formatting uses a single column, standard headings, and simple bullets for ATS readability.
- **Application preparation:** fill supported Lever and Greenhouse forms with approved documents and contact details, then review and submit manually.
- **Progress and recovery:** loading feedback, retry actions, resumable post scans, and cached comment drafts.

## Quick start

### 1. Install prerequisites and dependencies

Use **Node.js 22.13 or later**, npm, and installed **Google Chrome**. Hosted Groq generation does not require Ollama or a GPU.

From the repository root:

```powershell
npm install
npm install --prefix copilot-site
```

### 2. Configure your AI provider

For Groq, set the key in the same PowerShell terminal that will run the app:

```powershell
$env:GROQ_API_KEY = "your-groq-key"
npm start
```

On macOS/Linux, the equivalent environment setup is:

```sh
export GROQ_API_KEY="your-groq-key"
npm start
```

Keys are read from the companion process environment. The startup scripts do **not** automatically load `.env` files. Keep keys out of source files and the dashboard.

### 3. Connect the dashboard

1. Open **http://127.0.0.1:5173**.
2. Open **Settings**, paste the pairing token printed in the terminal, and connect.
3. Use the LinkedIn sign-in action and sign in inside the companion Chrome window.
4. Return to the dashboard to discover posts or open **Applications**.

The companion uses a separate persistent Chrome profile. Being signed in to LinkedIn in your ordinary Chrome window does not sign in the companion.

`npm start` launches both services. It reuses an existing dashboard from this project when detected. **Ctrl+C** stops the services it launched; a reused dashboard keeps running. Restarting the companion generates a new pairing token, so reconnect afterward.

| Service | Address |
| --- | --- |
| React dashboard | http://127.0.0.1:5173 |
| Companion API | http://127.0.0.1:4318 |
| Legacy manual dashboard | http://127.0.0.1:4318/legacy |

With the full project present, the companion home address redirects to the React dashboard. The standalone companion download does not include the React project and runs only the companion.

## Comment workflow

1. Configure your interests, verified profile facts, writing preferences, and scan settings.
2. Choose **Find & draft** to read a bounded batch of LinkedIn posts and generate suggestions. Use **Add post** for manual import when needed.
3. Review and edit each draft, then choose **Use comment** or skip it.
4. From **Approved**, choose **Prepare in LinkedIn** or prepare the approved queue.
5. Review the filled comment in LinkedIn and click **Post** yourself.

Scans save progress locally. Use the resume/retry action after an interrupted scan. Regenerate bypasses the draft cache. Preparation preserves a different existing comment draft rather than overwriting it.

The legacy dashboard uses a simpler **Copy & open in Chrome** flow: copy the comment, open the post, and paste manually.

## Job application workflow

### Set up your profile

In **Applications > Profile & master CV**, enter your verified experience, skills, preferences, and contact details. Upload a **PDF or DOCX up to 5 MB**, review the extracted text, and save. Scanned PDFs need OCR or manually pasted text.

Select **Groq (hosted)** and a supported model, or **Ollama (local)** and an installed model. The Groq configuration check verifies that a key is present; generation verifies actual model access.

### Find and save jobs

Use **Find LinkedIn jobs > Use profile suggestions**, then review the keywords and location. Choose work mode, posting date, and a batch size of 3, 5, or 10 before searching.

Review the listings and choose **Save job** or **Save all new jobs**. Search skips already saved LinkedIn job IDs. Profile suggestions use local rules; search results are not compatibility scores. You can also import a job URL directly or paste its description when extraction fails.

### Tailor, approve, and prepare

1. Verify the imported job description.
2. Choose **Score & tailor documents**.
3. Review compatibility, matches, gaps, source evidence, the resume, and the cover letter. Check every personal claim against your actual experience.
4. Confirm your review and choose **Approve documents**.
5. Download **Resume DOCX**, **Resume PDF**, or **Cover DOCX**, or choose **Prepare application**.
6. Complete any remaining employer questions, review the form, and submit yourself.
7. Explicitly confirm submission and **Mark as applied** in the dashboard.

Editing approved documents or profile/contact information revokes pending application approval. Saved jobs can be removed with their generated documents; your master CV and profile remain available.

Automatic form preparation supports standard public Lever and Greenhouse forms. Custom fields, screening questions, login challenges, unsupported sites, and final submission require manual completion. Opening or filling a form does not mark a job applied.

## AI configuration

| Workflow | Providers | Model configuration |
| --- | --- | --- |
| Comment generation | Groq or OpenAI | `GROQ_MODEL` defaults to `openai/gpt-oss-20b`; `OPENAI_MODEL` defaults to `gpt-4.1-mini` |
| Application scoring and documents | Groq or Ollama | Select the provider and model in Applications |

For comments, Groq takes priority when both `GROQ_API_KEY` and `OPENAI_API_KEY` are set. To use OpenAI, configure `OPENAI_API_KEY` without a Groq key in the companion environment.

Applications supports the Groq models `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. Generation uses three sequential requests: assessment, resume, and cover letter. Provider quotas and model availability apply.

Hosted generation sends the relevant content to the selected provider. Application generation includes your CV, profile, contact details, and job description. API keys stay in the companion process.

### Optional local Ollama

With Ollama installed and running, download a model and select it under Applications:

```powershell
ollama pull qwen3:4b
```

To create the repository's CPU-only variant:

```powershell
ollama create qwen3:4b-cpu -f Ollama.Modelfile
$env:OLLAMA_MODEL = "qwen3:4b-cpu"
```

Restart the companion after changing environment variables, then use **Check Ollama** and save your selection. `OLLAMA_HOST` defaults to `http://127.0.0.1:11434`; this workflow accepts only local Ollama hosts. Models are not downloaded automatically. Generation speed and model suitability depend on available memory and hardware.

`Ollama.GPU.Modelfile` provides an optional `qwen3:1.7b-gpu` configuration. GPU offload depends on compatible hardware and drivers; use hosted Groq if local inference is unreliable or too slow.

## Storage and privacy

| Data | Storage |
| --- | --- |
| Dashboard posts, settings, saved jobs, profile, extracted CV, and document drafts | Cloudflare D1 `workspaces` table, using local persisted D1 storage during local development |
| Scan checkpoints and comment draft cache | `.automation/` |
| Companion LinkedIn login session | `.browser-profile/` |
| Browser extraction and preparation diagnostics | `.diagnostics/` |
| Dashboard connection settings | Browser storage |

Original uploaded CV bytes are processed in memory; extracted CV text and document drafts are persisted in the workspace. PDF/DOCX exports are generated from approved document text. Chrome generates searchable PDFs locally.

Local runtime folders, environment files, dependencies, and build artifacts are excluded from Git. The automation and document-generation **source code is tracked**. Keep browser profiles, diagnostics, pairing tokens, and personal documents private. Removing local database state removes locally saved workspace data.

## Project structure

```text
companion/
|-- start.mjs                  # Starts companion and dashboard together
|-- server.mjs                 # Local API, pairing, and route handling
|-- automation.mjs             # LinkedIn browser automation
|-- jobs.mjs                   # Scan checkpoints, draft cache, and retries
|-- job-search.mjs             # Profile suggestions and LinkedIn job search
|-- applications.mjs           # AI scoring, evidence checks, and tailoring
|-- application-browser.mjs    # Job reading and application form preparation
|-- application-documents.mjs  # CV extraction and DOCX/PDF generation
|-- public/                    # Legacy manual dashboard
|-- copilot-site/              # React dashboard, API routes, and D1 schema
|-- Ollama.Modelfile           # Optional CPU model configuration
`-- Ollama.GPU.Modelfile       # Optional GPU model configuration
```

## Development commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm start` | Start the companion and dashboard together |
| `npm run dashboard` | Start only the dashboard |
| `node server.mjs` | Start only the companion |
| `npm run check` | Check companion JavaScript syntax |
| `npm test` | Run companion tests |
| `npm run build --prefix copilot-site` | Build the React dashboard |
| `npm run lint --prefix copilot-site` | Lint the React dashboard |

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Dashboard cannot reach the companion | Keep `npm start` running, verify port 4318, reconnect with the latest token, and allow local network access if prompted. |
| Dashboard reports an outdated companion | Stop and restart the companion after source updates, then pair again. |
| Dashboard dependencies are missing | Run `npm install --prefix copilot-site`. |
| LinkedIn appears logged out | Sign in within the companion Chrome profile. |
| Posts or job descriptions cannot be read | Inspect the open LinkedIn tab for login challenges. Retry or import manually; layout changes can require extractor updates. |
| API key missing or rejected | Set the correct provider key in the terminal running the companion and restart. |
| Provider quota or rate-limit error | Check provider usage and available quota; retry temporary limits later. |
| Ollama cannot generate documents | Check that Ollama is running and the selected model is installed, or switch Applications to Groq. |
| PDF generation fails | Verify Google Chrome is installed; download DOCX as an alternative. |
| Generated evidence does not match the CV | Review extracted CV/profile text and retry. Do not add unsupported experience to satisfy a job description. |

LinkedIn page changes can affect browser automation. Generated documents still require human review, and ATS-friendly formatting does not guarantee a particular score or hiring outcome.
