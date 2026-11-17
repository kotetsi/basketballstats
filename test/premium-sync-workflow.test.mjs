import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('R2 publisher is isolated and uses upload-only commands', async () => {
  const workflow = await fs.readFile('.github/workflows/premium-data-sync.yml', 'utf8');
  assert.match(workflow, /permissions:\s*contents: read/);
  assert.match(workflow, /aws s3 cp/);
  assert.doesNotMatch(workflow, /aws s3 (?:sync|rm|rb)\b/i);
  assert.doesNotMatch(workflow, /wrangler\s+deploy|CLOUDFLARE_API_TOKEN|PADDLE_/i);
  assert.doesNotMatch(workflow, /actions\/(?:download|upload)-artifact/);
  assert.match(workflow, /PREMIUM_R2_ACCESS_KEY_ID/);
  assert.match(workflow, /PREMIUM_R2_SECRET_ACCESS_KEY/);
  assert.match(workflow, /PREMIUM_R2_BUCKET/);
});
