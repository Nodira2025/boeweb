import { createClient } from '@supabase/supabase-js';
import { OperationalHealthAlerts } from '../../operational-health-alerts.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event, context) {
  const startedAt = new Date().toISOString();

  try {
    let tenants = [{ id: '11111111-1111-1111-1111-111111111111' }, { id: '22222222-2222-2222-2222-222222222222' }];

    if (SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: dbTenants } = await supabaseAdmin.from('tenants').select('id').eq('status', 'ACTIVE');
      if (dbTenants && dbTenants.length > 0) tenants = dbTenants;
    }

    const summaries = [];
    for (const t of tenants) {
      const summary = OperationalHealthAlerts.runTenantHealthChecks(t.id, {});
      summaries.push(summary);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'SUCCESS',
        scheduled_at: startedAt,
        tenants_checked: summaries.length,
        summaries
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'CHECK_FAILED',
        error: err.message
      })
    };
  }
}
