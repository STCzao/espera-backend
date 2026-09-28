/**
 * Application boundary for a single user/system action.
 *
 * Use cases coordinate validation, authorization and repositories, while domain
 * entities/services keep business rules that can be tested without transport
 * concerns.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
