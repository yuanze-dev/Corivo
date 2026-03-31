# Corivo Plugin - Usage Examples

Real-world examples of how Corivo enhances your Claude Code experience.

## Example 1: Project Setup Memory

### First Session - Saving Decisions

```
You: We're using Node.js with TypeScript, ESLint with Prettier,
     and Jest for testing. We follow conventional commits.

Claude: Got it! Let me save these project setup decisions.

     [corivo] Saving: Project technology stack
     [corivo] Saving: Code style preferences
     [corivo] Saving: Commit convention
```

### Later Session - Retrieving Context

```
You: Add a new utility function

Claude: I'll create a TypeScript utility function with proper types.
     Based on your saved preferences:
     - TypeScript for type safety ✓
     - Following ESLint rules ✓
     - Jest test included ✓

     [Creates: src/utils/dateFormatter.ts]
     [Creates: src/utils/__tests__/dateFormatter.test.ts]
```

---

## Example 2: Personal Preferences

### Saving Your Style

```
You: I hate comments that state the obvious.
     I prefer code that is self-documenting with good variable names.

Claude: Noted! Saving your code philosophy.

     [corivo] Saved: Coding preference - minimal comments
```

### Applied in Future Work

```
You: Review this function

Claude: Looking at your code...
     Based on your preference for self-documenting code:
     - Variable names are clear ✓
     - No obvious comments ✓
     - Logic reads naturally ✓

     This aligns well with your style!
```

---

## Example 3: Team Knowledge Base

### Learning Team Conventions

```
You: On our team, we always:
     1. Write tests before implementation (TDD)
     2. Keep functions under 20 lines
     3. Use dependency injection for services

Claude: Saving team development practices...

     [corivo] Saved: Team coding standards
```

### Enforcing Standards

```
You: Create a user service

Claude: Following your team's TDD approach, I'll:
     1. First write the test
     2. Then implement the function
     3. Keep it under 20 lines
     4. Use dependency injection

     [corivo] Referenced: Team standards during implementation
```

---

## Example 4: API Documentation

### Documenting Endpoints

```
You: The user service has these endpoints:
     GET  /api/users           - List all users
     GET  /api/users/:id       - Get single user
     POST /api/users           - Create user
     PUT  /api/users/:id       - Update user
     DEL  /api/users/:id       - Delete user

Claude: Saving API documentation...

     [corivo] Saved: User service API endpoints
```

### Quick Reference

```
You: How do I delete a user again?

Claude: [corivo] Checking saved API docs...

     Found it! DELETE /api/users/:id

     Would you like me to generate the fetch code for this?
```

---

## Example 5: Debugging History

### Recording Bug Solutions

```
You: Fixed the race condition - added a debounce to the search input
     with 300ms delay. Used lodash's debounce function.

Claude: Saving the bug fix for future reference...

     [corivo] Saved: Bug fix - search race condition
```

### Preventing Recurrence

```
You: The search is acting weird again

Claude: [corivo] Checking previous similar issues...

     Found a similar fix! You previously solved a search race condition
     by adding a 300ms debounce. Should I apply the same solution?
```

---

## Example 6: Workflow Automation

### Storing Complex Procedures

```
You: To release a new version:
     1. Update VERSION file
     2. Run npm run changelog
     3. Commit with "chore: release vX.Y.Z"
     4. git tag vX.Y.Z
     5. git push && git push --tags
     6. Create GitHub release

Claude: Saving release procedure...

     [corivo] Saved: Release workflow steps
```

### Guided Execution

```
You: Help me cut a release

Claude: Based on your saved release procedure:
     ✓ Step 1: Updated VERSION (0.10.5 → 0.10.6)
     ✓ Step 2: Generated changelog
     ✓ Step 3: Created commit
     → Step 4: Ready to tag and push. Shall I proceed?
```

---

## Example 7: Environment Configuration

### Saving Environment Details

```
You: Dev server runs on port 3000, API on 8080.
     Database is PostgreSQL on localhost:5432.
     Redis cache on localhost:6379.

Claude: Saving development environment configuration...

     [corivo] Saved: Local dev environment setup
```

### Quick Environment Check

```
You: What port is the API on?

Claude: [corivo] Checking environment config...

     Your API runs on port 8080.
     Make sure it's running before making requests.
```

---

## Example 8: Decision Rationale

### Recording "Why" Decisions

```
You: We chose Redis for caching because:
     - It's faster than Memcached for our use case
     - We need persistent cache options
     - Team has Redis experience

Claude: Saving technology decision with rationale...

     [corivo] Saved: Cache technology choice with reasons
```

### Revisiting Decisions

```
You: Should we consider switching cache?

Claude: [corivo] Retrieving cache decision...

     You chose Redis because:
     - Performance advantage ✓
     - Persistence options ✓
     - Team familiarity ✓

     These factors likely still apply. What changed?
```

---

## Conversation Flow Examples

### Context-Aware Assistance

```
Session 1:
You: I'm working on a React project with TypeScript
Claude: [corivo] Saved: Current project stack

Session 2 (days later):
You: How do I handle forms?
Claude: Since you're using React + TypeScript, I recommend
     react-hook-form with proper type definitions...
```

### Cross-Session Memory

```
Session 1:
You: My name is Sarah, I'm a senior developer
Claude: [corivo] Saved: User identity

Session 2:
You: Can you explain this concept?
Claude: Sure Sarah! Since you're a senior developer, I'll dive
     straight into the advanced details...
```

---

## Tips for Best Results

1. **Be Explicit** - Say "save this" or "remember that" for important info
2. **Provide Context** - Explain why something matters when saving
3. **Check Memory** - Ask "what do you know about..." to see what's saved
4. **Update When Needed** - Say "update that" to refresh old memories
5. **Use Categories** - Specify "this is a decision" vs "this is a fact"

---

## Memory Types Reference

| When to Use | Type | Example |
|-------------|------|---------|
| Stating facts about you | `事实 · self` | "I live in Tokyo" |
| Recording technical choices | `决策 · project` | "We chose PostgreSQL" |
| Saving how something works | `知识 · knowledge` | "Redux middleware pattern" |
| Storing preferences | `指令 · self` | "I prefer tabs over spaces" |
| Documenting team info | `事实 · people` | "John is the frontend lead" |
| API/Configuration details | `知识 · asset` | "Database connection string format" |
