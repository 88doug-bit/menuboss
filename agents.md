Spawn the following agents in parallel, 
each agent works in its own isolated git worktree in separate branches so changes can be reviewed and merged cleanly
Agents:
- Implementer: implement the new auth flow
- Reviewer: review the changes as they are made
- Researcher: investigate related patterns in the codebase
- Tester: write and run tests for the new code