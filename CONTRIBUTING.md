# Contributing to GymMaster

Thank you for your interest! GymMaster is free software, released under the **GNU General Public License v3.0** (see [LICENSE](LICENSE)). Issues and pull requests are welcome.

## Reporting bugs

- Check the existing issues before opening a new one.
- Use the bug report template and give as many details as you can.

## Pull requests

- Run the tests first: `cd backend && npm test` (needs Docker) and `cd frontend && npm test && npm run lint`. GitHub Actions runs them on every pull request; ESLint errors and warnings both block it.
- If you change a piece of logic (records, volume, dates, permissions, authentication), add or update its test.
- If users can see your change, update `version.json`: the version and a changelog entry written for users.
- Every change to `backend/prisma/schema.prisma` needs its migration (`npx prisma migrate dev --name ...`): the tests check that the migrations build exactly the schema.
- Write comments, docs, commit messages and pull requests in English. Code names (variables, files, routes, database tables) are in Italian: keep them consistent with the code around them.
- By contributing you agree that your contribution is released under the GPLv3, like the rest of the project.
