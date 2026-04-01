# Corivo Installation Journey Design

Date: 2026-04-01
Status: Draft approved in conversation
Scope: One-command installer journey for new users running `install.sh`

## Goal

Design a first-run installation journey that feels simple, trustworthy, and productized for users who already use AI coding agents but do not understand environment setup.

The installer should feel like it is getting the machine ready for the user, not asking the user to perform setup work manually.

## Primary User

- Primary: people already using Codex, Claude Code, Cursor, or OpenCode, but who are not comfortable with terminal setup or local environment details
- Future expansion: broader knowledge workers with even less technical familiarity

## Product Outcome

The user should finish the run with this feeling:

`Corivo is already working with my AI tools and has started understanding my context.`

Not this:

`The installation completed.`

## Journey Direction

Chosen direction: `Guided Autopilot`

This means:

- the installer handles almost everything automatically
- the user is interrupted only for decisions that truly require consent or preference
- technical implementation details stay out of the main surface
- progress is shown as a stable stage-based flow instead of noisy logs
- the ending focuses on activation, not only completion

## Core Principles

1. Only interrupt when user choice is truly required.
2. Show users what matters to them, not how the internals work.
3. Use calm, system-installer language rather than chatty assistant language.
4. Keep the user oriented with clear stage progress.
5. If something fails, make recovery obvious for both humans and AI assistants.
6. Success means activation and trust, not just file writes.

## Supported Environment Intent

- Agent platforms should be treated as equally important: Codex, Claude Code, Cursor, OpenCode
- Operating system differences should be absorbed by the installer whenever possible
- Users should not need to understand platform-specific branches unless it affects what Corivo can do for them

## Desired Emotional Arc

1. `I found a real product, not a random script`
2. `This is handling the hard parts for me`
3. `I understand what it is doing`
4. `My local data is being handled safely`
5. `Corivo has already started helping`

## Full Journey

### 1. Arrival

When the user runs the script, they first see a lightweight TUI moment:

- a pixel-art style Corivo companion
- subtle animation such as fade-in, blink, or breathing motion
- a short welcome line

Purpose:

- establish Corivo as a product and companion
- make the terminal feel intentional and memorable
- create a calm transition into setup

The visual tone should feel alive, not playful to the point of distraction.

### 2. Language Confirmation

After the welcome moment, the installer asks one short language question.

Rules:

- always ask once
- infer the default from system language when possible
- default to English for all non-matching locales
- keep the interaction short and lightweight

Reasoning:

- avoids silently guessing wrong
- respects bilingual needs
- preserves an English-first fallback for broader compatibility

### 3. One-Line Promise

After language is confirmed, the installer gives one short promise that frames the rest of the experience.

The promise should communicate:

- Corivo will prepare the machine
- Corivo will connect to AI tools already installed
- Corivo will perform a local warm-up so it can help sooner

Purpose:

- reduce uncertainty before automation begins
- make the remaining steps feel like one coherent flow

### 4. Stage-Based Autopilot

The main install surface uses a stable four-stage flow instead of raw logs.

Stages:

1. `Preparing your machine`
2. `Connecting your AI tools`
3. `Starting Corivo`
4. `Warming up with local context`

Each stage should show one of three states:

- `In progress`
- `Done`
- `Needs attention`

Guidance:

- stage names must be user-oriented
- avoid exposing implementation-specific vocabulary in stage labels
- detailed command output should go to logs, not the main surface

### 5. High-Trust Local Warm-Up Consent

Before importing recent local AI conversation history, the installer asks for short, explicit consent.

This is a trust moment, not a permission wall.

The confirmation must explain three things clearly:

1. why this happens now
2. what value it gives the user
3. why the data handling is safe

Required framing:

- Corivo can get ready faster by learning from recent local AI conversations
- this helps it remember working style, recent decisions, and project context from the start
- this stays on the device and is used only to set up Corivo on this machine

Interaction:

- `Continue`
- `Skip for now`

Rules:

- continuing should feel recommended
- skipping should not feel like failure
- do not use alarming or overly technical language like “scan all history” on the main surface

### 6. Activation Ending

The installation ending is not a generic completion summary.

It is an activation screen that tells the user:

- the machine is ready
- which AI tools were connected
- whether local warm-up completed
- whether any follow-up attention is needed

The primary headline should communicate readiness to work together, not just successful installation.

Examples of outcomes:

- Corivo is ready and connected to the detected agents
- Corivo is ready, but one detected agent still needs login
- Corivo is ready on this machine even though no supported agents were found yet

### 7. First Call to Action

The last thing the user sees should be a low-effort prompt they can copy into any supported AI agent.

Requirements:

- one universal prompt, not one per agent
- phrased in a way that lets the user immediately test Corivo’s value
- ideally personalized using signals from the local warm-up

Purpose:

- shorten time-to-value
- create a direct “it knows me” moment
- move from installation into usage without making the user invent the first test

## Stage Content Guidelines

### Stage 1: Preparing Your Machine

The user should see result-oriented language such as:

- checking what Corivo needs
- installing what is missing
- this may take a minute

If administrator permission is required, explain the user impact only:

- this step needs permission to install required tools on this machine

Avoid foregrounding terms like `nvm`, `gcc`, or package-manager specifics unless they are needed in a diagnostic artifact.

### Stage 2: Connecting Your AI Tools

The user should see language such as:

- looking for AI tools already installed on this machine
- connecting Corivo to the tools you use

Avoid terms like:

- host adapter
- hooks config
- config injection

If multiple agents are found:

- connect all of them automatically
- summarize the result at the user level

If no supported agents are found:

- do not treat the run as failed
- explain that Corivo is ready and can connect when an agent is installed later

### Stage 3: Starting Corivo

This stage should emphasize live readiness:

- starting Corivo on this machine
- making sure it can keep working in the background

If background behavior is limited on the current machine, say what it affects, not the low-level reason.

### Stage 4: Warming Up With Local Context

This is the strongest value stage.

The user should understand:

- Corivo is getting a head start
- it is learning recent local context
- this remains on the device

If the warm-up completes, the user should see a brief value outcome rather than a technical summary.

## Edge Cases

### No Supported Agent Found

Desired outcome:

- Corivo still becomes ready on the machine
- the run is not framed as failed or incomplete
- the user is told Corivo can connect later when a supported agent is installed

### Multiple Agents Found

Desired outcome:

- connect all automatically
- no user choice required
- summarize all connected tools clearly at the end

### Some Agents Need Follow-Up

Desired outcome:

- continue the full install flow
- end with `Needs attention` instead of global failure
- specify exactly which tool needs attention and the next direct step

### User Skips Local Warm-Up

Desired outcome:

- Corivo is still ready
- no guilt or fear messaging
- communicate that warm-up can be done later

### Slow Network or Partial Download Failure

Desired outcome:

- show that work is still in progress rather than appearing frozen
- if a timeout or failure occurs, explain what did not complete and what Corivo can or cannot do yet

### OS Differences

Desired outcome:

- hide internal platform branching from the main narrative
- only expose user-impacting differences
- do not ask the user to reason about OS-specific mechanics

## Error Recovery Design

Errors must be written so that:

- the user can understand the impact quickly
- an AI assistant can diagnose the problem without guessing

Every major failure should include:

1. what failed
2. what Corivo was trying to do
3. what this affects
4. what to do next
5. where the diagnostic summary is stored

Recommended user-facing pattern:

- `Corivo couldn’t finish preparing this machine.`
- `It was trying to install required runtime tools.`
- `Corivo has not started yet.`
- `Try again on a stable network, or ask an AI assistant for help with the diagnostic summary below.`
- `Diagnostic summary: ~/.corivo/install-diagnostic.txt`

The generated diagnostic summary should include:

- stable step ID
- user-facing step name
- exact action or command attempted
- raw stderr and stdout excerpt
- detected OS and environment facts
- detected agent environment facts
- suggested next actions

The installer should explicitly tell the user they can paste this summary into an AI assistant.

## Copywriting Direction

The installer voice should feel like a trustworthy system installer:

- clear
- calm
- direct
- minimal

It should not feel like:

- a developer script
- a verbose CLI debug tool
- a chatty AI assistant

Copy style rules:

- prefer user outcomes over implementation terms
- reduce jargon wherever possible
- explain sensitive actions right before they happen
- keep lines short and scan-friendly

## Non-Goals

- exposing every technical action in the main installation output
- asking the user to choose among detected agents
- forcing users to understand operating system differences
- treating skipped warm-up or missing agents as fatal failure states

## Success Criteria

This design is successful if:

1. new users can run the installer with minimal decisions
2. users understand what Corivo is doing at each high-level stage
3. local data warm-up feels valuable and safe
4. partial setup issues do not collapse the entire experience
5. the final screen drives immediate product usage
6. any error can be handed to an AI assistant without guesswork

## Next Planning Topics

The implementation planning phase should cover:

- TUI opening experience and animation constraints
- stage-state model and rendering behavior
- localization strategy and fallback rules
- local warm-up consent UX and messaging
- diagnostic summary format and persistence path
- CTA generation strategy using cold-start context
- behavior matrix across agent combinations and operating systems
