# Security policy

## This repository contains intentionally vulnerable code

`SECURITY_MODE=vulnerable` starts a target API with deliberate flaws (broken authorization, `alg=none` JWTs, SSRF, mass assignment, a debug endpoint that returns the signing key, and more). They exist so the test suite can prove it detects them. They are **not** bugs to report.

- The server binds to `127.0.0.1` only. Do not change that, put it behind a proxy, or deploy it anywhere.
- Static analysis (CodeQL, Semgrep) is expected to flag the vulnerable branches in `src/`. Those alerts are triaged as intentional in the code-scanning dashboard; alerts on the hardened branches are treated as real.
- The default mode is `hardened`.

## Known gaps in hardened mode

- Login is protected by a per-account lockout (5 failures, then 15 minutes). There is no per-IP throttle, so password spraying across many accounts is not rate limited. In a deployed service this belongs at the gateway or WAF.
- State such as users, lockouts, rate-limit windows and coupon redemptions is held in memory for a single process. It is not shared across instances.

## Reporting a vulnerability

Report a real issue, such as a hardened-mode flaw, a test that passes against a vulnerable behaviour, a leaked secret or a problem in the CI pipeline, through [GitHub private vulnerability reporting](https://github.com/yonduudontaxx/api-security-test-suite/security/advisories/new). Please do not open a public issue for it.

Include the mode, the request that shows the issue, and the expected versus actual response. You will get an acknowledgement within 5 working days.

## Supported versions

Only the `main` branch is maintained.
