# SourceKit Charm - Tester Guide

**URL:** https://source-gem.lovable.app

AI-powered candidate sourcing for technical recruiting. Research roles, search for candidates, enrich profiles, manage your pipeline, and generate outreach -- all in one tool.

---

## Getting Started

### 1. Create an account
- Go to https://source-gem.lovable.app
- Click **Create account**
- Enter your email and a password (6+ characters)
- Check your email for a confirmation link, click it
- Sign in with your credentials

### 2. Configure Settings (recommended first)
Click **Settings** in the sidebar. Fill in:
- **Target Role** -- The role you're hiring for (e.g. "Staff ML Engineer"). This pre-fills search forms and personalizes outreach.
- **Target Company** -- Your company name (e.g. "Anthropic"). Used in outreach generation.
- **One-Line Pitch** -- A hook for candidates (e.g. "Building the next generation of AI safety tools"). Included in outreach messages.
- **Slack Webhook URL** *(optional)* -- Candidates will be posted to this Slack channel when moved to "Contacted" stage.
- **Webhook URL** *(optional)* -- Candidate data is POSTed here when moved to "Contacted".

Click **Save Settings**.

---

## Core Workflow

The tool is designed around a 3-step workflow: **Research > Search > Enrich**, then manage candidates in the **Pipeline**.

### Step 1: Research a Role

1. Click **New Search** in the sidebar
2. Select the **Research** mode tab (beaker icon)
3. Choose input type:
   - **Quick**: Enter a job title and company name
   - **Full Spec**: Paste an entire job description
4. Click **Research**
5. Wait 2-4 minutes while the AI analyzes the role

**What you get back:**
- **Target Companies** -- Companies to source from, with rationale for each
- **EEA Signals** -- Evidence of Exceptional Ability markers to look for (PhD, publications, notable employers, etc.)
- **Search Criteria** -- Keywords and skills to use in your search

**What to do next:**
- Review the research output. Remove any irrelevant keywords with the X button, add your own with "+ Add"
- Click **Find Candidates** to auto-populate the search form and switch to Search mode
- Or click any **Suggested Search** chip (e.g. "ML Engineer at DeepMind") to run a targeted search

### Step 2: Search for Candidates

1. Select the **Search** mode tab (magnifying glass icon)
2. Fill in the search form:
   - **Results count**: 10, 20, or 50 candidates
   - **Role / Title** *(required)*: e.g. "Senior ML Engineer"
   - **Company / Industry**: e.g. "Fintech, Acme Inc" (comma-separated)
   - **Location**: e.g. "San Francisco, Remote"
   - **Skills / Keywords**: e.g. "React, Python, ML"
3. Click **Search Candidates**
4. Wait 30-90 seconds while Exa finds matching profiles

**Search results show:**
- Name, title, company, location
- Source badge (LinkedIn, GitHub, or Web)
- Description snippet
- Signal tags (PhD, top university, Ex-Google, GitHub stars, etc.)

**Actions on each candidate card:**
| Button | What it does |
|--------|-------------|
| **Enrich** | Runs deep AI enrichment on this candidate (work history, publications, EEA scoring, contact info). Takes 15-60 seconds. |
| **Save** | Adds candidate to your Pipeline in the "Sourced" stage. Checks for duplicates first. |
| **Copy URL** | Copies the candidate's profile URL to clipboard |
| **View** | Opens their profile in a new tab |

**Batch enrichment:**
- Click **Enrich All** above results to enrich every candidate sequentially
- A progress bar shows how many are done. Click **Stop** to cancel.

**Filtering results:**
- Use the source filter pills (All / LinkedIn / GitHub / Other) to narrow by source
- Toggle between **Expanded** and **Compact** view modes

### Step 3: Enrich a Single Candidate

If you already know who you want to look up:
1. Select the **Enrich** mode tab (sparkles icon)
2. Enter their **Name** and **Company** (required). Optionally add Role and GitHub handle.
3. Click **Enrich**
4. Review the enrichment data (summary, work history, GitHub activity, EEA signals, contact info)
5. Click **Save to Pipeline** to add them

---

## Pipeline Management

Click **Pipeline** in the sidebar to manage your candidates.

### Pipeline Stages
Candidates progress through 5 stages:

| Stage | Meaning |
|-------|---------|
| **Sourced** | Just added from search. Default stage. |
| **Contacted** | You've reached out. Triggers webhook/Slack if configured. |
| **Responded** | They replied to your outreach. |
| **Screen** | Scheduled or completed a technical screen. |
| **Offer** | Offer extended. |

### Moving Candidates Between Stages
- **Quick advance**: Click the arrow icon on any candidate row to move to the next stage
- **Choose stage**: Expand a candidate, then click any stage pill button
- **Bulk move**: Check multiple candidates, use the floating action bar's "Move to..." dropdown

### Candidate Details (click to expand)
Expanding a candidate shows:
- **EEA Score** -- Numerical score based on exceptional ability signals
- **Stage selector** -- Click any stage to move
- **Enrichment data** -- Full AI-generated profile (if enriched)
- **Notes** -- Add notes that auto-save after typing
- **Tags** -- Add custom tags for filtering (e.g. "strong-python", "needs-visa")
- **Actions**:
  - **Write Outreach** -- AI generates a personalized outreach message using your Settings context
  - **Share to Slack** -- Posts candidate details to your configured Slack channel
  - **Delete** -- Removes candidate (with confirmation)

### Filtering & Sorting
- **Stage filter pills** at the top -- click to show only one stage
- **Tag filter pills** -- click to filter by tag
- **Search bar** -- filter by name, company, role, or tags
- **Score sort** -- toggle to sort by EEA score

### Bulk Operations
1. Check the checkbox on multiple candidates
2. A floating action bar appears at the bottom:
   - **Move to...** -- Change stage for all selected
   - **Export** -- Download selected as CSV
   - **Delete** -- Remove all selected (with confirmation)

### Pipeline Chat
Click the chat icon to interact with AI about your pipeline. Ask questions like:
- "Move all Sourced candidates to Contacted"
- "Tag everyone at Google with 'faang'"
- "Draft outreach for the top 3 candidates"

### CSV Export
Click **Export** in the pipeline header to download all candidates as a CSV file with columns: name, role, company, stage, score, linkedin_url, email, skills, summary, notes, created_at.

---

## Other Tabs

### History
- Shows your past searches and research sessions
- Click any entry to re-run it
- Delete entries you don't need

### Watchlist
- Save candidates you want to track but aren't ready to pipeline yet
- Click **+ Add** to manually add someone
- Items saved from the Enrich tab appear here

---

## Tips for Testers

1. **Start with Research mode** if you have a specific role in mind -- it dramatically improves search quality
2. **Enrich before saving** to get the full EEA score and signal detection
3. **Set up Settings first** -- target role/company/pitch are used by outreach generation
4. **Use tags** to organize candidates (e.g. by skill, priority, visa status)
5. **Try the Pipeline Chat** for bulk operations -- it understands natural language commands

## Known Limitations
- Search can take up to 2 minutes for large result sets
- Enrichment depends on publicly available data -- some candidates may have limited info
- Each user's data is fully isolated -- you won't see other testers' candidates

## Feedback
Please note:
- Any bugs or errors you encounter (screenshots help!)
- Features that feel confusing or missing
- Search queries that return poor results
- Enrichment quality issues
