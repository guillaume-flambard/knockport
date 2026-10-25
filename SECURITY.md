# Security policy

## Supported state

knockport is currently an **open-source prototype** with a tagged `v0.1.0` demo release. No independent security audit, real-world applicant-data approval, commercial SLA or coordinated disclosure response window is promised.

Security-sensitive issues may affect the studio passphrase, WebSocket sessions, application intake, candidate timelines, database, content rendering or deployment configuration.

## Reporting a vulnerability

**Do not open a public issue with a working exploit, credentials or applicants' personal information.**

If GitHub **Private Vulnerability Reporting** is enabled for this repository, use the repository's **Security** tab to submit a private report. If the option is unavailable, contact the maintainer through the [professional contact linked on the GitHub profile](https://github.com/guillaume-flambard), requesting a private disclosure channel; share only the minimum non-sensitive summary until a safe channel is established.

Provide the affected version/commit, the minimal reproduction conditions, the expected versus observed behavior, and likely impact. Please do not attack deployments or access anyone else's candidate data while investigating.

## Project boundaries

- The public demonstration uses example content; do not send real personal data to the demo.
- Passing tests does not establish security, GDPR compliance or legal suitability for production hiring.
- Changes that affect authentication, storage, applicant retention, sanitization, sessions or access control require specific negative tests and separate review before deployment.

## Known limitations

No public support window or release maintenance guarantee is established. Recheck the code and deployment assumptions independently before using this software to collect real applications.
