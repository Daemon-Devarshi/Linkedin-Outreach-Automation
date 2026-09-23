/**
 * Centralized LinkedIn selector configurations for stable and accessible locators.
 * Matches accessible roles, ARIA labels, component attributes, and text-based matches.
 */
export const SELECTORS = {
  // Authentication / Nav indicator
  auth: {
    globalNav: '#global-nav',
    feedIdentity: '.feed-identity-module'
  },

  // Profile Header Connection Selectors
  connection: {
    // Primary Connect button directly on the profile hero/header section
    connectDirect: [
      'a[componentkey*="ConnectButton"]',
      'button[componentkey*="ConnectButton"]',
      'a[aria-label^="Invite "][aria-label*="connect"]',
      'button[aria-label^="Invite "][aria-label*="connect"]',
      'button:has(svg#connect-small)',
      'a:has(svg#connect-small)',
      'button[aria-label*="Connect"]'
    ],

    // Fallback text match for direct connect button
    connectTextMatch: 'Connect',

    // "More actions" button in the profile header
    moreActions: [
      'button[aria-label="More actions"]',
      'button[aria-label="More"]',
      'button:has(svg#more-actions-horizontal-small)',
      'div.artdeco-dropdown button[aria-label*="More"]'
    ],

    // Connect button inside the "More actions" dropdown menu
    connectFromMore: [
      'div.artdeco-dropdown__content a[componentkey*="ConnectButton"]',
      'div.artdeco-dropdown__content div[role="button"]:has-text("Connect")',
      'div.artdeco-dropdown__content span.artdeco-dropdown__item-text',
      'div.artdeco-dropdown__content button'
    ],

    // Indicators that connection request is already pending or already connected
    pending: [
      'main a[aria-label*="Pending"]',
      'main button[aria-label*="Pending"]',
      'main a[aria-label*="Withdraw"]',
      'main button[aria-label*="Withdraw"]',
      'main button:has-text("Pending")',
      'main span:has-text("Pending")'
    ],

    alreadyConnected: [
      'main a:has-text("Message")',
      'main button:has-text("Message")',
      'main button[aria-label*="Send a message to"]'
    ],

    // Invitation Dialog / Modal Selectors
    modalDialog: 'div[role="dialog"], .artdeco-modal',
    addNoteBtn: [
      'button[aria-label="Add a note"]',
      'button:has-text("Add a note")',
      'a[aria-label="Add a note"]',
      'a:has-text("Add a note")'
    ],
    sendWithoutNoteBtn: [
      'button[aria-label="Send without a note"]',
      'button:has-text("Send without a note")',
      'a:has-text("Send without a note")'
    ],
    noteTextarea: [
      'textarea[name="message"]',
      'textarea#custom-message',
      'textarea',
      '[contenteditable="true"]',
      'div[role="textbox"]'
    ],
    sendInvitationBtn: [
      'button[aria-label="Send invitation"]',
      'button[aria-label="Send now"]',
      'button[aria-label^="Send"]',
      'button:has-text("Send")'
    ]
  }
};
