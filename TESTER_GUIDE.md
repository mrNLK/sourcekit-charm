# SourceKit Charm — Tester Guide

**URL:** https://source-gem.lovable.app

---

## What Is SourceKit Charm?

SourceKit Charm is an AI-powered recruiting tool that helps you **find, evaluate, and contact** technical talent. Instead of manually scrolling through LinkedIn or GitHub, you describe the role you're hiring for and the tool:

1. **Researches** what kind of candidate you need (skills, target companies, signals of excellence)
2. **Searches** the web for matching people using AI-powered search
3. **Enriches** each candidate with publications, open-source work, and Evidence of Exceptional Ability (EEA) scoring
4. **Generates** personalized outreach messages that reference real achievements

Think of it as a research analyst + sourcer + copywriter — automated into one workflow.

---

## How the Search APIs Work

SourceKit Charm uses two external AI services to find and evaluate candidates. Understanding how they work helps you write better queries.

### Exa (Candidate Search)

Exa is a **semantic web search engine** built for AI. Unlike Google, which matches keywords, Exa understands meaning. When you search for "Staff ML Engineer," it finds people whose profiles *describe* that role — even if those exact words don't appear.

**How it's used:** When you click **Search Candidates**, the app sends your role, company, location, and skills to Exa as a structured query. Exa returns real people from LinkedIn, personal sites, and public profiles.

**Tips for better results:**
| Do this | Not this |
|---------|----------|
| "Senior backend engineer experienced with distributed systems" | "backend" |
| "ML researcher who has published at NeurIPS or ICML" | "ML person" |
| Include a company context: "...at a Series B fintech startup" | Leave company blank |
| Add 2-3 specific skills: "Rust, WASM, compiler design" | Just "Rust" |

Exa works best with **natural language descriptions** — write it like you'd describe the ideal candidate to a colleague.

### Parallel (Role Research)

Parallel is a **deep research AI** that reads the web and synthesizes findings. When you enter a job description, Parallel reads it, then researches:
- Which companies have people with this skillset
- What "Evidence of Exceptional Ability" signals to look for (PhD, publications, patents, awards)
- What keywords and search criteria to use

**How it's used:** The Research tab sends your job title + company (or full JD text) to Parallel, which spends 2-4 minutes doing web research and returns a structured sourcing strategy.

**Tips:** The more specific your input, the better the research. A pasted job description gives far richer results than just "ML Engineer."

### Lovable AI Gateway (Enrichment & Outreach)

When you enrich a candidate, the app runs **3 parallel web searches** (LinkedIn, publications, open source) via Exa, then sends all that context to an AI model that produces:
- A professional summary
- Key achievements
- EEA signal scoring (PhD, top company, publications, open source, patents, leadership)
- Evidence links for each signal

For outreach, the AI writes a short personalized message referencing the candidate's real work.

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SOURCEKIT CHARM                       │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │ RESEARCH │───▶│  SEARCH  │───▶│     ENRICH       │  │
│  │          │    │          │    │                   │  │
│  │ Describe │    │ Find     │    │ Deep profile      │  │
│  │ the role │    │ matching │    │ + EEA scoring     │  │
│  │          │    │ people   │    │ + publications    │  │
│  └──────────┘    └──────────┘    └────────┬──────────┘  │
│       │                                    │            │
│       │          ┌──────────────┐          │            │
│       │          │   PIPELINE   │◀─────────┘            │
│       │          │              │                        │
│       │          │  Sourced ──▶ Contacted ──▶ Screen    │
│       │          │              │                        │
│       │          └──────┬───────┘                        │
│       │                 │                                │
│       │          ┌──────▼───────┐                        │
│       │          │   OUTREACH   │                        │
│       │          │              │                        │
│       └─────────▶│ AI writes a  │                        │
│                  │ personalized │                        │
│                  │ message      │                        │
│                  └──────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

---

## Getting Started

### 1. Create an Account
- Go to **https://source-gem.lovable.app**
- Click **Create account**
- Enter your email and a password (6+ characters)
- Check your email for a confirmation link and click it
- Sign in with your credentials

### 2. Configure Settings (Do This First)
Click **Settings** in the sidebar. Fill in:

| Setting | What it does | Example |
|---------|-------------|---------|
| **Target Role** | Pre-fills search forms, used in outreach | "Staff ML Engineer" |
| **Target Company** | Your company name, included in outreach | "Anthropic" |
| **One-Line Pitch** | A hook for candidates in outreach messages | "Building the next generation of AI safety tools" |
| **Slack Webhook** *(optional)* | Auto-posts to Slack when a candidate reaches "Contacted" | `https://hooks.slack.com/...` |
| **Webhook URL** *(optional)* | POSTs candidate data on stage changes | `https://yourapp.com/webhook` |

Click **Save Settings**.

---

## Step-by-Step Walkthrough

### Step 1: Research a Role

Best when you have a job description or specific role in mind.

1. Click **New Search** in the sidebar
2. Select the **Research** tab (beaker icon)
3. Choose your input:
   - **Quick**: Enter a job title ("Staff ML Engineer") and company ("Anthropic")
   - **Full Spec**: Paste an entire job description for richer results
4. Click **Research**
5. Wait 2-4 minutes while Parallel AI analyzes the role

**What you get back:**

```
┌─────────────────────────────────────────────────┐
│              RESEARCH OUTPUT                     │
├─────────────────────────────────────────────────┤
│                                                  │
│  Target Companies                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ DeepMind │ │  OpenAI  │ │  Cohere      │    │
│  │ (rival)  │ │ (rival)  │ │ (adjacent)   │    │
│  └──────────┘ └──────────┘ └──────────────┘    │
│                                                  │
│  EEA Signals                                     │
│  ☑ PhD in ML/CS    ☑ NeurIPS/ICML papers        │
│  ☑ Top company     ☑ Open source maintainer      │
│  ☑ Conference talks                              │
│                                                  │
│  Search Criteria                                 │
│  [Python] [PyTorch] [distributed training]       │
│  [RLHF] [transformer architectures]             │
│                                                  │
│  [✏ Edit any of these]  [▶ Find Candidates]      │
└─────────────────────────────────────────────────┘
```

- **Review and edit** — Remove irrelevant keywords with ✕, add your own with "+ Add"
- Click **Find Candidates** to jump to Search with everything pre-filled
- Or click a **Suggested Search** chip to run a targeted query

### Step 2: Search for Candidates

1. Select the **Search** tab (magnifying glass icon)
2. Fill in the search form:
   - **Results count**: 10, 20, or 50
   - **Role / Title** *(required)*: e.g. "Senior ML Engineer"
   - **Company / Industry**: e.g. "Fintech, Acme Inc" (comma-separated)
   - **Location**: e.g. "San Francisco, Remote"
   - **Skills / Keywords**: e.g. "React, Python, ML"
3. Click **Search Candidates**
4. Wait 30-90 seconds

**Each result card shows:**
- Name, title, company, location
- Source badge (LinkedIn, GitHub, or Web)
- Description snippet
- Signal tags (PhD, top university, Ex-Google, GitHub stars, etc.)

**Actions on each card:**

| Button | What it does |
|--------|-------------|
| **Enrich** | Runs deep AI enrichment — work history, publications, EEA scoring, contact info. Takes 15-60 seconds. |
| **Save** | Adds to your Pipeline in "Sourced" stage. Checks for duplicates. |
| **Copy URL** | Copies their profile URL |
| **View** | Opens their profile in a new tab |

**Batch enrichment:** Click **Enrich All** above results to process every candidate. A progress bar tracks completion.

**Filter by source:** Use the pills (All / LinkedIn / GitHub / Other) to narrow results.

### Step 3: Enrich a Specific Person

If you already know who you're looking for:

1. Select the **Enrich** tab (sparkles icon)
2. Enter their **Name** and **Company** (required). Optionally add Role and GitHub handle.
3. Click **Enrich**
4. Review the enrichment data:
   - Summary and key achievements
   - Work history and GitHub activity
   - EEA signals with evidence links
   - Contact information
5. Click **Save to Pipeline**

### Step 4: Manage Your Pipeline

Click **Pipeline** in the sidebar. Candidates progress through 5 stages:

```
┌──────────┐   ┌───────────┐   ┌───────────┐   ┌────────┐   ┌───────┐
│ SOURCED  │──▶│ CONTACTED │──▶│ RESPONDED │──▶│ SCREEN │──▶│ OFFER │
│          │   │           │   │           │   │        │   │       │
│ Just     │   │ Outreach  │   │ They      │   │ Tech   │   │ Offer │
│ added    │   │ sent      │   │ replied   │   │ screen │   │ sent  │
└──────────┘   └───────────┘   └───────────┘   └────────┘   └───────┘
```

**How to move candidates:**
- **Quick advance**: Click the arrow icon on any row → next stage
- **Choose stage**: Expand a candidate → click any stage pill
- **Bulk move**: Check multiple candidates → use the floating action bar's "Move to..." dropdown

**Expanded candidate view shows:**
- EEA Score (numerical)
- Full enrichment data
- Notes (auto-saved as you type)
- Custom tags (e.g. "strong-python", "needs-visa")
- **Write Outreach** button — AI generates a personalized message using your Settings context
- **Share to Slack** — Posts to your configured Slack channel
- **Delete** — Removes candidate (with confirmation)

**Filtering:**
- Stage filter pills at top
- Tag filter pills
- Search bar (name, company, role, tags)
- Score sort toggle

### Step 5: Generate Outreach

1. Expand any candidate in the Pipeline
2. Click **Write Outreach**
3. The AI writes a ~100-word message that:
   - References a specific achievement from their enrichment data
   - Mentions your target role and company pitch
   - Uses casual, human tone (no recruiter-speak)
   - Ends with a soft ask
4. Copy and customize before sending

### Step 6: Bulk Operations

Check multiple candidates in the Pipeline → a floating action bar appears:
- **Move to...** — Change stage for all selected
- **Export** — Download as CSV
- **Delete** — Remove all selected

**Pipeline Chat** (click the chat icon): Talk to AI about your pipeline. Examples:
- "Move all Sourced candidates to Contacted"
- "Tag everyone at Google with 'faang'"
- "Draft outreach for the top 3 candidates"

---

## Other Tabs

### History
- Past searches and research sessions
- Click any entry to re-run it
- Delete entries you don't need

### Watchlist
- Save candidates you want to track but aren't ready to pipeline
- Click **+ Add** to manually add someone
- Items saved from the Enrich tab appear here

### CSV Export
Click **Export** in the pipeline header. Columns: name, role, company, stage, score, linkedin_url, email, skills, summary, notes, created_at.

---

## Tips for Testers

1. **Start with Research mode** — It dramatically improves search quality by giving the AI context
2. **Enrich before saving** — You get the full EEA score and signal detection
3. **Set up Settings first** — Target role, company, and pitch are used by outreach generation
4. **Use tags** to organize (e.g. "strong-python", "needs-visa", "priority")
5. **Try the Pipeline Chat** for bulk operations — it understands natural language
6. **Paste a real JD** into Research for the best results

## Known Limitations

- Search can take up to 2 minutes for large result sets
- Enrichment depends on publicly available data — some candidates may have limited info
- Each user's data is fully isolated — you won't see other testers' candidates
- LinkedIn enrichment quality varies by how public the candidate's profile is

## Feedback

Please note:
- Any bugs or errors (screenshots help!)
- Features that feel confusing or missing
- Search queries that return poor results
- Enrichment quality issues
- Outreach message quality
- Pipeline workflow friction points
