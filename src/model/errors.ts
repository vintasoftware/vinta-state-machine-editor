/** Thrown when an operation is asked to do something the machine cannot represent. */
export class StateMachineError extends Error {
  override readonly name = 'StateMachineError';
}
