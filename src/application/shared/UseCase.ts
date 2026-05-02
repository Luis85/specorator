import type { Result } from '@/domain/shared/Result'

export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<Result<TOutput>>
}
