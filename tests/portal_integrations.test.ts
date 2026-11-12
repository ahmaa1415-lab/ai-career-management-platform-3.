import {
  getAllConnectedPortals,
  syncPortalIntegration,
  togglePortalIntegrationStatus
} from '../lib/portal-integrations';
import db, { getOrCreateDefaultUser } from '../lib/db';

console.log('--- RUNNING PORTAL INTEGRATIONS TEST SUITE ---');

// 1. Check default user
const user = getOrCreateDefaultUser();
console.log(`✓ Default user loaded: ${user.id} (${user.email})`);

// 2. Fetch all connected platforms
const portals = getAllConnectedPortals(user.id);
console.log(`✓ Fetched ${portals.length} connected platforms.`);

if (portals.length < 8) {
  throw new Error(`Expected at least 8 platforms, got ${portals.length}`);
}

const expectedServices = [
  'linkedin',
  'wuzzuf',
  'bayt',
  'naukrigulf',
  'gulftalent',
  'indeed',
  'remoteok',
  'company_portals'
];

for (const s of expectedServices) {
  const p = portals.find(item => item.service === s);
  if (!p) {
    throw new Error(`Missing expected platform service: ${s}`);
  }
  console.log(`  - [✓] Platform ${p.name} (${p.category}) status=${p.status}, email=${p.account_email}`);
  if (!p.account_email.includes('@')) {
    throw new Error(`Platform ${s} has invalid account email: ${p.account_email}`);
  }
  if (!p.target_regions || p.target_regions.length === 0) {
    throw new Error(`Platform ${s} missing target regions`);
  }
}

// 3. Test syncPortalIntegration
console.log('\nTesting syncPortalIntegration:');
const syncRes = syncPortalIntegration(user.id, 'wuzzuf');
if (!syncRes.success) throw new Error('Failed to sync wuzzuf');
console.log(`✓ Sync wuzzuf succeeded: ${syncRes.message}`);

// 4. Test togglePortalIntegrationStatus
console.log('\nTesting togglePortalIntegrationStatus:');
const toggleRes1 = togglePortalIntegrationStatus(user.id, 'bayt');
console.log(`✓ Toggled bayt to: ${toggleRes1.newStatus}`);
const toggleRes2 = togglePortalIntegrationStatus(user.id, 'bayt');
console.log(`✓ Toggled bayt back to: ${toggleRes2.newStatus}`);

console.log('\n✓ ALL PORTAL INTEGRATIONS TESTS PASSED (8/8 PLATFORMS VERIFIED)');
