// Outbound-request identity shared by every script that talks to a third-party
// origin (scripts/leads_source.ts, scripts/validate.ts --check-links).
//
// Pure: a constant, no network. One fixed User-Agent for the whole project so
// origins see the same identity every run. It names the project and links to
// the repo — never a person's name, email address or account id. The same rule
// covers every other header, query string and request body we send out.

export const USER_AGENT = "doohub/1.0 (+https://github.com/schmug/DooHub)";
