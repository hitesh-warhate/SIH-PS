// Case status lifecycle (PRD 9.5). "ready" is Intake complete with a saved draft summary; "alert" is shown in the queue whenever an
// emergency flag is open. An invalid transition is refused, never forced.
export const STATUSES = ['registered', 'in_intake', 'alert', 'ready', 'in_consultation', 'completed', 'rejected'];

export const TRANSITIONS = {
  registered: ['in_intake', 'alert', 'ready'],
  in_intake: ['alert', 'ready'],
  alert: ['in_intake', 'ready'],
  ready: ['in_consultation'],
  in_consultation: ['completed', 'rejected'],
  rejected: ['completed'],
  completed: [],
};

export const canMove = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

// Moves an encounter in one atomic statement: the row changes only if it is still in the expected state.
// Returns true when it moved, false when the transition is not allowed or the case had already moved on.
export async function transition(db, encounterId, to, { extra = '' } = {}) {
  const { rows: [e] } = await db.query('SELECT status FROM encounters WHERE id = $1', [encounterId]);
  if (!e || !canMove(e.status, to)) return false;
  const { rowCount } = await db.query(`UPDATE encounters SET status = $2 ${extra} WHERE id = $1 AND status = $3`, [encounterId, to, e.status]);
  return rowCount === 1;
}
