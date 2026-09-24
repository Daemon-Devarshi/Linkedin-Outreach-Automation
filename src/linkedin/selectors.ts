/**
 * Centralized LinkedIn selector configurations for stable and accessible locators.
 * Prefers accessible roles, ARIA labels, and text-based matches.
 */
export const SELECTORS = {
  // Login Page
  login: {
    usernameInput: 'input[type="email"]:visible, input[type="text"]:visible, #username',
    passwordInput: 'input[type="password"]:visible, #password',
    submitButton: 'button:has-text("Sign in"):visible, button[type="submit"]:visible',
  },

  // Logged-in State Detectors
  auth: {
    globalNav: '#global-nav',
    feedPageElement: '.feed-identity-module, #global-nav',
  },

  // Connection Workflow
  connection: {
    // Primary Connect button directly on profile header
    connectDirect: 'a[componentkey*="ConnectButton"], a[aria-label^="Invite "][aria-label*="connect"], a:has(svg#connect-small), a:has-text("Connect"):visible, button:has-text("Connect"):visible',
    
    // More actions button to open the dropdown
    moreActions: 'button[aria-label="More actions"]:visible, button:has-text("More"):visible',
    
    // Connect button inside the More dropdown
    connectFromMore: 'a[componentkey*="ConnectButton"]:visible, div[role="button"]:has-text("Connect"):visible, span:has-text("Connect"):visible, button:has-text("Connect"):visible',
    
    // Status checks (scoped to main profile actions to prevent navbar false positives)
    pending: 'main a[aria-label*="Pending"]:visible, main button[aria-label*="Pending"]:visible, main a[aria-label*="Withdraw"]:visible, main button[aria-label*="Withdraw"]:visible',
    message: 'main a:has-text("Message"):visible, main button:has-text("Message"):visible',
    
    // Follow Button
    followBtn: 'button[aria-label^="Follow"]:visible, button[aria-label*="Follow"]:visible, button:has(svg#add-small):visible, button.org-company-follow-button:visible, button.follow:visible, button.org-top-card-primary-actions__action:has-text("Follow"):visible, button:has-text("Follow"):visible, a:has-text("Follow"):visible',

    // Invitation Modal
    addNoteBtn: 'a:has-text("Add a note"):visible, button:has-text("Add a note"):visible, [aria-label="Add a note"]:visible',
    sendWithoutNoteBtn: 'a:has-text("Send without a note"):visible, button:has-text("Send without a note"):visible',
    noteTextarea: 'textarea:visible, [contenteditable="true"]:visible, div[role="textbox"]:visible, textarea[name="message"]:visible, textarea#custom-message:visible',
    sendInvitationBtn: 'button:has-text("Send"):visible, a:has-text("Send"):visible, button[aria-label="Send now"]:visible, button[aria-label="Send invitation"]:visible, button[aria-label^="Send"]:visible',
  }
};
