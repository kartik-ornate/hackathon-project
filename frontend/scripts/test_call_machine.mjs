/**
 * test_call_machine.mjs — headless unit test for the call FSM.
 *   cd frontend && node scripts/test_call_machine.mjs
 */
import { createActor } from 'xstate'
import { callMachine } from '../src/state/callMachine.js'

let failures = 0
function check(cond, msg) {
  if (cond) console.log('  ok  —', msg)
  else { console.error('  FAIL —', msg); failures++ }
}

const a = createActor(callMachine).start()
const val = () => a.getSnapshot().value

check(val() === 'idle', 'starts in idle')
a.send({ type: 'START' });                                   check(val() === 'active', 'START → active')
a.send({ type: 'RISK', action: 'monitor', riskScore: 20 });  check(val() === 'active', 'monitor risk stays active')
a.send({ type: 'RISK', action: 'warn', riskScore: 65 });     check(val() === 'warn', 'warn risk → warn')
a.send({ type: 'ACK' });                                      check(val() === 'active', 'ACK on warn → active (call continues)')
a.send({ type: 'RISK', action: 'warn', riskScore: 70 });     check(val() === 'warn', 're-warn → warn')
a.send({ type: 'RISK', action: 'block', riskScore: 95 });    check(val() === 'block', 'escalate warn → block')
check(a.getSnapshot().context.riskScore === 95, 'context tracks latest riskScore')
a.send({ type: 'ACK' });                                      check(val() === 'ended', 'ACK on block → ended')
a.send({ type: 'RESET' });                                    check(val() === 'idle', 'RESET → idle')

// Direct block path + STOP
a.send({ type: 'START' });                                   check(val() === 'active', 'restart → active')
a.send({ type: 'RISK', action: 'block', riskScore: 100 });   check(val() === 'block', 'active → block directly')
a.send({ type: 'STOP' });                                     check(val() === 'ended', 'STOP on block → ended')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
