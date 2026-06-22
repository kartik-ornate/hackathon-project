/**
 * callMachine.js — the deterministic call lifecycle (XState v5).
 *
 * idle → active → (warn ⇄ active | block) → ended → idle
 *
 * This formalizes the warn-vs-block UX that was previously ambiguous:
 *   - WARN is advisory: the user can acknowledge (ACK) and the call CONTINUES.
 *   - BLOCK is terminal: acknowledging or stopping ENDS the call.
 * A risk that climbs from warn → block escalates without resetting.
 */
import { setup, assign } from 'xstate'

const isBlock = ({ event }) => event.action === 'block'
const isWarn = ({ event }) => event.action === 'warn'

export const callMachine = setup({
  actions: {
    recordRisk: assign({
      riskScore: ({ event }) => event.riskScore ?? 0,
      action: ({ event }) => event.action ?? 'monitor',
    }),
  },
  guards: { isBlock, isWarn },
}).createMachine({
  id: 'call',
  initial: 'idle',
  context: { riskScore: 0, action: 'monitor' },
  states: {
    idle: {
      on: { START: { target: 'active' } },
    },
    active: {
      on: {
        RISK: [
          { target: 'block', guard: 'isBlock', actions: 'recordRisk' },
          { target: 'warn', guard: 'isWarn', actions: 'recordRisk' },
          { actions: 'recordRisk' }, // monitor: stay active, update context
        ],
        STOP: { target: 'ended' },
      },
    },
    warn: {
      on: {
        RISK: [
          { target: 'block', guard: 'isBlock', actions: 'recordRisk' },
          { actions: 'recordRisk' }, // stay in warn, update context
        ],
        ACK: { target: 'active' }, // dismiss warning, keep the call going
        STOP: { target: 'ended' },
      },
    },
    block: {
      on: {
        RISK: { actions: 'recordRisk' },
        ACK: { target: 'ended' }, // acknowledging a block ends the call
        STOP: { target: 'ended' },
      },
    },
    ended: {
      on: { RESET: { target: 'idle', actions: assign({ riskScore: 0, action: 'monitor' }) } },
    },
  },
})
