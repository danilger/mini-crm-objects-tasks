/**
 * Smoke-check RLS against a live Supabase project.
 *
 * Required env:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   VERIFY_MANAGER_EMAIL / VERIFY_MANAGER_PASSWORD
 *   VERIFY_WORKER_EMAIL / VERIFY_WORKER_PASSWORD
 *   VERIFY_OTHER_WORKER_EMAIL / VERIFY_OTHER_WORKER_PASSWORD (optional but recommended)
 */
import { createClient } from '@supabase/supabase-js'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

const url = required('VITE_SUPABASE_URL')
const anon = required('VITE_SUPABASE_ANON_KEY')

async function clientAs(email, password) {
  const client = createClient(url, anon)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`)
  return client
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
  console.log('OK:', message)
}

async function main() {
  const manager = await clientAs(
    required('VERIFY_MANAGER_EMAIL'),
    required('VERIFY_MANAGER_PASSWORD'),
  )
  const worker = await clientAs(
    required('VERIFY_WORKER_EMAIL'),
    required('VERIFY_WORKER_PASSWORD'),
  )

  const { data: allTasks, error: managerTasksErr } = await manager.from('tasks').select('id, assignee_id, status')
  assert(!managerTasksErr, 'manager can list tasks')
  assert((allTasks?.length ?? 0) > 0, 'seed has tasks')

  const foreign = allTasks.find((t) => t.assignee_id !== (await worker.auth.getUser()).data.user.id)
  assert(foreign, 'there is a task not assigned to worker1')

  const { data: stolen, error: stealErr } = await worker
    .from('tasks')
    .select('*')
    .eq('id', foreign.id)
    .maybeSingle()
  assert(!stealErr && !stolen, 'worker cannot read foreign task')

  const { error: badUpdate } = await worker
    .from('tasks')
    .update({ title: 'hacked' })
    .eq('id', foreign.id)
  // either error or zero rows; PostgREST may return no error with 0 rows
  const { data: stillForeign } = await manager.from('tasks').select('title').eq('id', foreign.id).single()
  assert(stillForeign?.title !== 'hacked', 'worker cannot update foreign task')

  const { error: directStatus } = await worker
    .from('tasks')
    .update({ status: 'accepted' })
    .eq('id', foreign.id)
  void directStatus
  const { data: statusCheck } = await manager.from('tasks').select('status').eq('id', foreign.id).single()
  assert(statusCheck?.status !== 'accepted' || foreign.status === 'accepted', 'direct status hack blocked')

  const { data: mine } = await worker.from('tasks').select('id, status').limit(1)
  if (mine?.[0]) {
    const { error: illegalRpc } = await worker.rpc('transition_task', {
      p_task_id: mine[0].id,
      p_new_status: 'accepted',
      p_comment: null,
    })
    assert(!!illegalRpc, 'worker cannot accept own task via RPC')
  }

  const { error: historyWrite } = await worker.from('task_status_history').insert({
    task_id: allTasks[0].id,
    from_status: 'new',
    to_status: 'accepted',
    changed_by: (await worker.auth.getUser()).data.user.id,
    comment: 'forged',
  })
  assert(!!historyWrite, 'worker cannot forge history')

  console.log('\nAll RLS checks passed.')
}

main().catch((err) => {
  console.error('\nVERIFY FAILED:', err.message)
  process.exit(1)
})
