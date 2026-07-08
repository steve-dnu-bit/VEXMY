# Vapi setup — why the agent ignores the knowledge file

If your agent is not using `vapi-agent-knowledge-base.md`, the usual cause is **file upload without a Query Tool + system prompt instructions**. Vapi does not automatically search uploaded files unless you configure this.

## Recommended setup (Query Tool)

### Step 1 — Upload the knowledge file

1. Vapi Dashboard → **Files** → upload `docs/vapi-agent-knowledge-base.md`
2. Copy the **file ID** (you need it for the tool)

### Step 2 — Create a Query Tool

1. Dashboard → **Tools** → **Create Tool** → **Query** (or API: create a tool with type `query`)
2. Name it clearly, e.g. `velbok_knowledge_search`
3. Attach the uploaded file ID(s)
4. Description (important — the model reads this):

```
Search Velbok product documentation, pricing, setup guides, POS/Tap to Pay, Stripe deposits, consent, CRM, and FAQs. Use for ANY question about Velbok features, prices, limits, or how to configure the platform.
```

### Step 3 — Attach tool to assistant

1. Open your assistant → **Model** → **Tools** → add `velbok_knowledge_search`
2. On the tool, add a **request-start message** (stops awkward silence while searching):

```
Let me look that up in our documentation — one moment.
```

### Step 4 — Paste the system prompt

1. Open `docs/vapi-system-prompt.txt`
2. Copy everything between `=== START` and `=== END`
3. Replace `{{QUERY_TOOL_NAME}}` with your exact tool function name (e.g. `velbok_knowledge_search`)
4. Paste into the assistant **System Prompt** (first system message)

### Step 5 — Test

Ask these in the Vapi test console:

| Question | Agent should |
|----------|----------------|
| "How much is the Studio plan?" | Call query tool → say £19.95/month, 6 seats, 14-day trial |
| "How do I set up Tap to Pay?" | Call query tool → Stripe Connect, Terminal location, download app |
| "How many AI stencils on Solo?" | Call query tool → 2 per 24 hours |

If the tool is never called, the function name in the prompt does not match the tool name in Vapi.

---

## Alternative: embed knowledge in prompt (small KB only)

If you cannot use Query Tool yet, paste **Quick facts** from `vapi-system-prompt.txt` section 5 into the system prompt. This works for pricing and URLs but will not cover full docs. Not recommended long term — file is ~15KB and voice prompts should stay focused.

---

## API example (Query Tool)

```json
{
  "type": "query",
  "function": {
    "name": "velbok_knowledge_search",
    "description": "Search Velbok documentation and pricing. Use for any Velbok product, setup, or pricing question."
  },
  "knowledgeBases": [
    {
      "provider": "google",
      "name": "velbok-docs",
      "description": "Velbok studio platform docs and pricing",
      "fileIds": ["YOUR_FILE_ID_HERE"]
    }
  ],
  "messages": [
    {
      "type": "request-start",
      "content": "Let me check our documentation — one moment."
    }
  ]
}
```

Attach this tool ID to your assistant's `model.toolIds` array.

---

## Step 6 — Send call transcripts to Velbok

Velbok receives Vapi **end-of-call-report** webhooks, stores the transcript, and emails **support@velbok.com**.

### 1. Deploy the edge function and migration

```bash
npx supabase db push --project-ref tkremoxfkgoiuwghtzwd
npx supabase functions deploy vapi-webhook --project-ref tkremoxfkgoiuwghtzwd
```

### 2. Add the webhook secret in Supabase

Dashboard → **Edge Functions** → **Secrets**:

| Secret | Value |
|--------|--------|
| `VAPI_WEBHOOK_SECRET` | Exactly **32 characters**. Must match Vapi `serverUrlSecret` exactly. |

### 3. Configure your Vapi assistant

#### Where in the Vapi dashboard (important)

| Section | What it is | Put Velbok URL/secret here? |
|---------|------------|----------------------------|
| **Assistant → Advanced → Server URL** | Webhook to *your* server (Velbok) | **Yes** |
| **Assistant → Transcriber → Deepgram** | Speech-to-text *during* the call | **No** — not related to transcript emails |
| **Assistant → Model / Voice** | LLM and TTS | **No** |

**Deepgram** only converts the caller’s voice to text for the AI to read in real time. It does **not** send the call transcript to Velbok. Do not paste the Supabase URL or webhook secret into any Deepgram / transcriber / API key field.

#### Correct fields (Assistant → **Advanced**)

1. **Server URL** (sometimes labeled *Messaging server URL* or under *Server*):

```
https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/vapi-webhook
```

2. **Server URL secret** — paste exactly (32 characters):

```
1BrqtWLJn10IzRzC4KRdre7pFex2INo1
```

This is **not** a Deepgram API key. It is only the shared secret between Vapi and Velbok.

3. **Server messages** — in the same Advanced / Messaging area, enable:

- `end-of-call-report` (required for transcript email)
- optional: `status-update`

If you only enable **Client messages** (e.g. `transcript` for the browser widget), Velbok will **not** receive the end-of-call report. You need **Server messages**.

#### Alternative: org-wide default

**Settings → Server URL** (account level) — same URL and secret if you prefer one webhook for all assistants.

**Server URL:**

```
https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/vapi-webhook
```

**Server URL secret:** same value as `VAPI_WEBHOOK_SECRET`

**Server messages:** enable at least `end-of-call-report` (optional: `status-update`, `transcript`)

API example:

```json
{
  "serverUrl": "https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/vapi-webhook",
  "serverUrlSecret": "your-webhook-secret",
  "serverMessages": ["end-of-call-report", "status-update"]
}
```

### 4. Test

Place a test call, hang up, then check:

- Inbox at **support@velbok.com** for the transcript email
- Supabase table `vapi_call_logs` (platform admins can list via `platform_admin_list_vapi_calls`)

Vapi signs requests with **HMAC-SHA256** in the `X-Vapi-Signature` header. If you get `401 Invalid signature`, the secret in Vapi and Supabase do not match.

---

## Files in this repo

| File | Purpose |
|------|---------|
| `docs/vapi-agent-knowledge-base.md` | Full docs + pricing — upload to Vapi Files |
| `docs/vapi-system-prompt.txt` | System prompt — paste into assistant |
| `docs/vapi-setup-instructions.md` | This setup guide |
| `supabase/functions/vapi-webhook/` | Webhook handler — transcripts + email |
