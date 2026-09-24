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

    // Follow button
    followBtn: [
      'button[aria-label^="Follow "]',
      'button[aria-label^="Follow"]',
      'button[aria-label="Follow"]',
      'button:has(svg#add-small)',
      'button:has(svg[id="add-small"])',
      'button:has(svg[data-test-icon*="add"])',
      'button.org-company-follow-button',
      'button.follow',
      'button.org-top-card-primary-actions__action',
      'button:has-text("Follow")',
      'a:has-text("Follow")'
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
  },

  // Company Page Messaging Selectors
  company: {
    messageBtn: [
      'button[aria-label^="Message "]',
      'button[aria-label*="Message"]',
      'button:has(svg[data-test-icon="send-privately-small"])',
      '.org-top-card-primary-actions__inner button:has-text("Message")',
      '.org-top-card-primary-actions button:has-text("Message")',
      'main section button:has-text("Message")',
      'main button:has-text("Message")',
      'main a:has-text("Message")',
      '.org-top-card button:has-text("Message")'
    ],
    // Conversation Topic Selectors
    topicDropdown: [
      'select[name*="topic" i]',
      'select[id*="topic" i]',
      'div.artdeco-dropdown button[aria-label*="topic" i]',
      'div.artdeco-dropdown button[aria-label*="Conversation topic" i]',
      'button[aria-label*="Conversation topic" i]',
      'button[aria-label*="topic" i]',
      'div[role="combobox"][aria-label*="topic" i]',
      'div.msg-form__topic-selector button',
      'div.org-message-dialog__topic-select button'
    ],
    topicDropdownContainer: [
      'div.artdeco-dropdown',
      'div[data-artdeco-is-focused]',
      'fieldset:has-text("Conversation topic")',
      'div:has-text("Conversation topic *")',
      'div:has-text("Conversation topic")'
    ],
    topicOptions: [
      'div[role="listbox"] [role="option"]',
      'div.artdeco-dropdown__content [role="option"]',
      'div.artdeco-dropdown__content li',
      'div.artdeco-dropdown__content button',
      'div.artdeco-dropdown__content span.artdeco-dropdown__item-text',
      'div.artdeco-dropdown__content div[role="button"]'
    ],
    composer: [
      'div.msg-form__contenteditable[role="textbox"]',
      'div.msg-form__contenteditable',
      'div[role="textbox"][aria-label*="message" i]',
      'div[role="textbox"][aria-label*="Write a message" i]',
      '.msg-form__message-texteditor div[role="textbox"]',
      'div.msg-form__msg-content-container div[role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[name="message"]',
      'textarea.msg-form__textarea'
    ],
    sendBtn: [
      'button:has-text("Send message")',
      'button[aria-label*="Send message" i]',
      'button.msg-form__send-button:not([disabled])',
      'button.msg-form__send-button',
      'button[type="submit"].msg-form__send-btn',
      'button[type="submit"]:not([disabled])',
      'form.msg-form button[type="submit"]',
      'button[aria-label="Send now"]',
      'button[aria-label^="Send"]'
    ],
    threadContainer: [
      '.msg-s-message-list',
      '.msg-s-event-listitem',
      '.msg-s-message-group',
      '.msg-overlay-conversation-bubble'
    ]
  }
};
