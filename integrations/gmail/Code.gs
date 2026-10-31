/**
 * NexaBridge Gmail connector — owner-authorized Google Apps Script.
 * Run from script.google.com as nexabridgeops@gmail.com.
 * DO NOT deploy a publicly accessible Web App. This code has no doGet/doPost.
 */
const EXPECTED_MAILBOX = 'nexabridgeops@gmail.com';

function verifyAccount_() {
  const email = Session.getEffectiveUser().getEmail().toLowerCase();
  if (email !== EXPECTED_MAILBOX) throw new Error('Wrong Google account');
}
function testConnector() {
  verifyAccount_();
  return { mailbox: EXPECTED_MAILBOX, ready: true, unread: GmailApp.getInboxUnreadCount() };
}
function listInbox(limit) {
  verifyAccount_();
  const count = Math.min(30, Math.max(1, Number(limit) || 15));
  return GmailApp.search('in:inbox', 0, count).map(thread => {
    const message = thread.getMessages().slice(-1)[0];
    return {
      threadId: thread.getId(),
      messageId: message.getId(),
      from: message.getFrom(),
      subject: message.getSubject(),
      date: message.getDate().toISOString(),
      snippet: message.getPlainBody().slice(0, 240),
      unread: thread.isUnread()
    };
  });
}
function getMessage(messageId) {
  verifyAccount_();
  const message = GmailApp.getMessageById(String(messageId));
  return {
    messageId: message.getId(),
    from: message.getFrom(),
    to: message.getTo(),
    subject: message.getSubject(),
    date: message.getDate().toISOString(),
    body: message.getPlainBody()
  };
}
function sendMail(to, subject, body) {
  verifyAccount_();
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) throw new Error('Invalid recipient');
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 250) throw new Error('Invalid subject');
  if (typeof body !== 'string' || !body.trim() || body.length > 50000) throw new Error('Invalid message');
  GmailApp.sendEmail(to, subject, body);
  return {ok: true};
}
