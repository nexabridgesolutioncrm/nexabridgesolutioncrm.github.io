# NexaBridge CRM — Gmail integration configuration

Target mailbox: nexabridgeops@gmail.com
Frontend origin: https://nexabridgesolutioncrm.github.io
Backend: Supabase project eahoudfosrblcsbjgjoa

## Required Google Cloud setup (owner action)
1. Create or select a Google Cloud project controlled by NexaBridge Solutions.
2. Enable Gmail API.
3. Configure OAuth consent screen (External for a personal @gmail.com mailbox). Add nexabridgeops@gmail.com as a test user during testing.
4. Create OAuth Client ID type **Web application**. Authorized JavaScript origin: https://nexabridgesolutioncrm.github.io
5. Intended server-side callback URL: https://eahoudfosrblcsbjgjoa.supabase.co/functions/v1/nexabridge-gmail/callback
6. Store the OAuth CLIENT_SECRET exclusively in Supabase Edge Function secrets, never in GitHub Pages or client JavaScript.
7. Use Google OAuth with exact state matching, PKCE where applicable, short-lived state, server-side code exchange, offline refresh token, and strictly restricted server-side storage. Verify mailbox equals nexabridgeops@gmail.com.
8. Request narrow Gmail scopes: gmail.readonly and gmail.send. Implement no delete/modify endpoints without explicit owner approval.
9. Configure production OAuth verification if required for Gmail restricted scopes; Google Testing-mode refresh tokens may expire in 7 days.
10. Implement authorization and callback with server-side authentication/CSRF protections before the first real mailbox connection.

## Acceptance tests
- Authenticated CRM owner can initiate consent; non-owner cannot
- Only the expected Gmail address can be linked
- Inbox displays received messages (HTML escaped and safely rendered), pagination and message details
- Send action requires an explicit user click and valid recipient
- Reconnect/expired credentials return actionable errors; never expose OAuth tokens in browser or logs
- Provider disconnected state is honest; no false 'connected' indicator
- Store sent-message Gmail ID to prevent duplicate sends
- Client messages remain scoped to NexaBridge and accessible only to permitted roles
- Outbound SMTP/Gmail actions are never triggered by preview, refresh, or background rendering

## Current status
Google Cloud OAuth client ID and client secret have not been provided to the CRM backend. Direct sending/receiving is NOT active. This document is a setup/runbook, not a deployed mail connector.
