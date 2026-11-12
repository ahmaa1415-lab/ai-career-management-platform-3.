import { runAutonomousLinkedInAgent, getLinkedInAccountConnection } from '../lib/linkedin/autonomous-scout';

console.log('=== TEST LINKEDIN ACCOUNT CONNECTION ===');
const conn = getLinkedInAccountConnection();
console.log('Account Name:', conn.account_name);
console.log('Profile URL:', conn.profile_url);
console.log('Status:', conn.status);
console.log('Email:', conn.email);

console.log('\n=== RUNNING AUTONOMOUS SCOUT & MULTI-CHANNEL APPLY ===');
const result = runAutonomousLinkedInAgent();
console.log('Result Success:', result.success);
console.log('Message:', result.message);
console.log('Posts Scanned:', result.posts_scanned_count);
console.log('Applications Dispatched:', result.applications_dispatched_count);
console.log('Channel Breakdown:', result.channel_summary);

console.log('\n--- DISPATCHED APPLICATIONS DETAILS ---');
result.dispatched_applications.forEach((app, i) => {
  console.log(`\n[${i + 1}] ${app.role} at ${app.employer} (${app.location})`);
  console.log(`    Channel: ${app.channel_label}`);
  console.log(`    Match Score: ${app.match_score}% | CV: ${app.cv_title}`);
  if (app.details.email_to) console.log(`    Email sent to: ${app.details.email_to} | Subject: ${app.details.email_subject}`);
  if (app.details.portal_url) console.log(`    Portal: ${app.details.portal_platform} at ${app.details.portal_url} | Ref: ${app.details.confirmation_reference}`);
  if (app.details.linkedin_recipient) console.log(`    LinkedIn InMail to: ${app.details.linkedin_recipient} | Message: ${app.details.message_body?.slice(0, 80)}...`);
});
